var http = require('http');
var net = require('net');
var url = require('url');

var log = require('book');
var debug = require('debug')('localtunnel-server');
var createRawServer = require('http-raw');

var rand_id = require('./lib/rand_id');

// here be dragons, understanding of node http internals will be required
var HTTPParser = process.binding('http_parser').HTTPParser;

// id -> client http server
var clients = {};

// available parsers for requests
// this is borrowed from how node does things by preallocating parsers
var parsers = http.parsers;

// send this request to the appropriate client
// in -> incoming request stream
function proxy_request(client, req, res, rs, ws) {

    // socket is a tcp connection back to the user hosting the site
    var sock = client.sockets.shift();

    // queue request
    if (!sock) {
        debug('no more clients, queued: %s', req.url);
        rs.pause();
        client.waiting.push([req, res, rs, ws]);
        return;
    }

    debug('handle req: %s', req.url);

    // pipe incoming request into tcp socket
    // incoming request will close the socket when done
    // lt client should establish a new socket once request is finished
    // we do this instead of keeping socket open to make things easier
    rs.pipe(sock);

    sock.ws = ws;
    sock.req = req;

    // since tcp connection to upstream are kept open
    // invoke parsing so we know when the response is complete
    var parser = sock.parser;
    parser.reinitialize(HTTPParser.RESPONSE);
    parser.socket = sock;

    // we have completed a response
    // the tcp socket is free again
    parser.onIncoming = function (res) {
        parser.onMessageComplete = function() {
            debug('ended response: %s', req.url);

            // any request we had going on is now done
            ws.end();
            sock.end();

            // no more forwarding
            delete sock.ws;
            delete sock.req;
            delete parser.onIncoming;
        };
    };

    rs.resume();
}

function upstream_response(d, start, end) {
    var socket = this;

    var ws = socket.ws;
    if (!ws) {
        return log.warn('no stream set for req:', socket.req.url);
    }

    ws.write(d.slice(start, end));

    if (socket.upgraded) {
        return;
    }

    var ret = socket.parser.execute(d, start, end - start);
    if (ret instanceof Error) {
        log.error(ret);
        parsers.free(parser);
        socket.destroy(ret);
    }
}

var handle_req = function (req, res) {

    var max_tcp_sockets = req.socket.server.max_tcp_sockets;

    // without a hostname, we won't know who the request is for
    var hostname = req.headers.host;
    if (!hostname) {
        log.trace('no hostname: %j', req.headers);
        return res.end();
    }

    var match = hostname.match(/^([a-z]{4})[.].*/);
    if (match) {
        var client_id = match[1];
        var client = clients[client_id];

        // no such subdomain
        // we use 502 error to the client to signify we can't service the request
        if (!client) {
            debug('no client found for id: ' + client_id);
            res.statusCode = 502;
            return res.end('localtunnel error: no active client for \'' + client_id + '\'');
        }

        var rs = req.createRawStream();
        var ws = res.createRawStream();

        return proxy_request(client, req, res, rs, ws);
    }

    /// NOTE: everything below is for new client setup (not proxied request)

    // ignore favicon requests
    if (req.url === '/favicon.ico') {
        res.writeHead(404);
        return res.end();
    }

    var parsed = url.parse(req.url, true);

    // redirect main page to github reference for root requests
    if (req.url === '/' && !parsed.query.new) {
        res.writeHead(301, { Location: 'http://shtylman.github.com/localtunnel/' });
        res.end();
        return;
    }

    // at this point, the client is requesting a new tunnel setup
    // either generate an id or use the one they requested

    var match = req.url.match(/\/([a-z]{4})?/);

    // user can request a particular set of characters
    // will be given if not already taken
    // this is useful when the main server is restarted
    // users can keep testing with their expected ids
    var requested_id;
    if (match && match[1]) {
        requested_id = match[1];
    }

    var id = requested_id || rand_id();

    // if the id already exists, this client is assigned a random id
    if (clients[id]) {
        id = rand_id();
    }

    // sockets is a list of available sockets for the connection
    // waiting is a list of requests still needing to be handled
    var client = clients[id] = {
        sockets: [],
        waiting: []
    };

    // new tcp server to service requests for this client
    var client_server = net.createServer();
    client_server.listen(function() {
        var port = client_server.address().port;
        debug('tcp server listening on port: %d', port);

        var url = 'http://' + id + '.' + req.headers.host;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            // full url for internet facing requests
            url: url,
            // "subdomain" part
            id: id,
            // port for lt client tcp connections
            port: port,
            // maximum number of tcp connections allowed by lt client
            max_conn_count: max_tcp_sockets
        }));
    });

    // track initial user connection setup
    var conn_timeout;

    // user has 5 seconds to connect before their slot is given up
    function maybe_tcp_close() {
        clearTimeout(conn_timeout);
        conn_timeout = setTimeout(client_server.close.bind(client_server), 5000);
    }

    maybe_tcp_close();

    // no longer accepting connections for this id
    client_server.on('close', function() {
        log.trace('closed tcp socket for client(%s)', id);

        clearTimeout(conn_timeout);
        delete clients[id];

        // clear waiting by ending responses, (requests?)
        client.waiting.forEach(function(waiting) {
            waiting[1].end();
            waiting[3].end(); // write stream
        });
    });

    // new tcp connection from lt client
    client_server.on('connection', function(socket) {

        // no more socket connections allowed
        if (client.sockets.length >= max_tcp_sockets) {
            return socket.end();
        }

        debug('new connection for id: %s', id);

        // a single connection is enough to keep client id slot open
        clearTimeout(conn_timeout);

        // allocate a response parser for the socket
        // it only needs one since it will reuse it
        socket.parser = parsers.alloc();

        socket._orig_ondata = socket.ondata;
        socket.ondata = upstream_response;

        socket.once('close', function(had_error) {
            debug('client %s closed socket (error: %s)', id, had_error);

            // what if socket was servicing a request at this time?
            // then it will be put back in available after right?

            // remove this socket
            var idx = client.sockets.indexOf(socket);
            if (idx >= 0) {
                client.sockets.splice(idx, 1);
            }

            // need to track total sockets, not just active available

            debug('remaining client sockets: %s', client.sockets.length);

            // no more sockets for this ident
            if (client.sockets.length === 0) {
                debug('all client(%s) sockets disconnected', id);
                maybe_tcp_close();
            }
        });

        // close will be emitted after this
        socket.on('error', function(err) {
            log.error(err);
            socket.end();
        });

        client.sockets.push(socket);

        var next = client.waiting.shift();
        if (next) {
            debug('handling queued request');
            proxy_request(client, next[0], next[1], next[2], next[3]);
        }
    });

    client_server.on('error', function(err) {
        log.error(err);
    });
};

var handle_upgrade = function(req, ws) {

    if (req.headers.connection !== 'Upgrade') {
        return;
    }

    var hostname = req.headers.host;
    if (!hostname) {
        return res.end();
    }

    var match = hostname.match(/^([a-z]{4})[.].*/);

    // not a valid client
    if (!match) {
        return res.end();
    }

    var client_id = match[1];
    var client = clients[client_id];

    if (!client) {
        // no such subdomain
        return res.end();
    }

    var socket = client.sockets.shift();
    if (!socket) {
        // no available sockets to upgrade to
        return res.end();
    }

    var stream = req.createRawStream();

    socket.ws = ws;
    socket.upgraded = true;

    stream.once('end', function() {
        delete socket.ws;

        // when this ends, we just reset the socket to the lt client
        // this is easier than trying to figure anything else out
        socket.end();
    });

    stream.pipe(socket);
    socket.once('end', ws.end.bind(ws));
};

module.exports = function(opt) {
    opt = opt || {};

    var server = createRawServer();

    server.max_tcp_sockets = opt.max_tcp_sockets || 5;
    server.on('request', handle_req);
    server.on('upgrade', handle_upgrade);

    return server;
};

