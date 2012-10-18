
// builtin
var http = require('http');
var net = require('net');
var url = require('url');

// here be dragons
var HTTPParser = process.binding('http_parser').HTTPParser;
var ServerResponse = http.ServerResponse;
var IncomingMessage = http.IncomingMessage;

// vendor
var log = require('book');

// local
var rand_id = require('./lib/rand_id');

var server = http.createServer();

// id -> client http server
var clients = {};

// available parsers
var parsers = http.parsers;

// data going back to a client (the last client that made a request)
function socketOnData(d, start, end) {

    var socket = this;
    var req = this._httpMessage;

    var response_socket = socket.respond_socket;
    if (!response_socket) {
        log.error('no response socket assigned for http response from backend');
        return;
    }

    // pass the response from our client back to the requesting socket
    response_socket.write(d.slice(start, end));

    if (socket.for_websocket) {
        return;
    }

    // invoke parsing so we know when the response is complete
    var parser = response_socket.out_parser;
    parser.socket = socket;

    var ret = parser.execute(d, start, end - start);
    if (ret instanceof Error) {
        log.error(ret);
        freeParser(parser, req);
        socket.destroy(ret);
    }
}

function freeParser(parser, req) {
    if (parser) {
        parser._headers = [];
        parser.onIncoming = null;
        if (parser.socket) {
            parser.socket.onend = null;
            parser.socket.ondata = null;
            parser.socket.parser = null;
        }
        parser.socket = null;
        parser.incoming = null;
        parsers.free(parser);
        parser = null;
    }
    if (req) {
        req.parser = null;
    }
}

// single http connection
// gets a single http response back
server.on('connection', function(socket) {

    var self = this;

    // parser handles incoming requests for the socket
    // the request is what lets us know if we proxy or not
    var parser = parsers.alloc();
    parser.socket = socket;
    parser.reinitialize(HTTPParser.REQUEST);

    function our_request(req) {
        var res = new ServerResponse(req);
        res.assignSocket(socket);
        self.emit('request', req, res);
        return;
    }

    // a full request is complete
    // we wait for the response from the server
    parser.onIncoming = function(req, shouldKeepAlive) {

        log.trace('request', req.url);

        // default is that the data is not for the client
        delete parser.sock;
        delete parser.buffer;
        delete parser.client;

        var hostname = req.headers.host;
        if (!hostname) {
            log.trace('no hostname: %j', req.headers);
            return our_request(req);
        }

        var match = hostname.match(/^([a-z]{4})[.].*/);
        if (!match) {
            return our_request(req);
        }

        var client_id = match[1];
        var client = clients[client_id];

        // requesting a subdomain that doesn't exist
        if (!client) {
            return socket.end();
        }

        parser.client = client;

        // assigned socket for the client
        var sock = client.sockets.shift();

        // no free sockets, queue
        if (!sock) {
            parser.buffer = true;
            return;
        }

        // for tcp proxying
        parser.sock = sock;

        // set who we will respond back to
        sock.respond_socket = socket;

        var out_parser = parsers.alloc();
        out_parser.reinitialize(HTTPParser.RESPONSE);
        socket.out_parser = out_parser;

        // we have completed a response
        // the tcp socket is free again
        out_parser.onIncoming = function (res) {
            res.on('end', function() {
                log.trace('done with response for: %s', req.url);

                // done with the parser
                parsers.free(out_parser);

                // unset the response
                delete sock.respond_socket;

                var next = client.waiting.shift();
                if (!next) {
                    // return socket to available
                    client.sockets.push(sock);
                    return;
                }

                // reuse avail socket for next connection
                sock.respond_socket = next;

                // needed to know when this response will be done
                out_parser.reinitialize(HTTPParser.RESPONSE);
                next.out_parser = out_parser;

                // write original bytes we held cause we were busy
                sock.write(next.queue);

                // continue with other bytes
                next.resume();

                return;
            });
        };
    };

    // process new data on the client socket
    // we may need to forward this it the backend
    socket.ondata = function(d, start, end) {

        // run through request parser to determine if we should pass to tcp
        // onIncoming will be run before this returns
        var ret = parser.execute(d, start, end - start);

        // invalid request from the user
        if (ret instanceof Error) {
            log.error(ret);
            socket.destroy(ret);
            return;
        }

        // websocket stuff
        if (parser.incoming && parser.incoming.upgrade) {
            log.trace('upgrade request');

            parser.finish();

            var hostname = parser.incoming.headers.host;

            var match = hostname.match(/^([a-z]{4})[.].*/);
            if (!match) {
                return our_request(req);
            }

            var client_id = match[1];
            var client = clients[client_id];

            var sock = client.sockets.shift();
            sock.respond_socket = socket;
            sock.for_websocket = true;

            socket.ondata = function(d, start, end) {
                sock.write(d.slice(start, end));
            };

            socket.end = function() {
                log.trace('websocket end');

                delete sock.respond_socket;
                client.sockets.push(sock);
            }

            sock.write(d.slice(start, end));

            return;
        }

        // if no available socket, buffer the request for later
        if (parser.buffer) {

            // pause any further data on this socket
            socket.pause();

            // copy the current data since we have already received it
            var copy = Buffer(end - start);
            d.copy(copy, 0, start, end);
            socket.queue = copy;

            // add socket to queue
            parser.client.waiting.push(socket);

            return;
        }

        if (!parser.sock) {
            return;
        }

        // assert, respond socket should be set

        // send through tcp tunnel
        // responses will go back to the respond_socket
        parser.sock.write(d.slice(start, end));
    };

    socket.onend = function() {
        var ret = parser.finish();

        if (ret instanceof Error) {
            log.error(ret);
            socket.destroy(ret);
            return;
        }

        socket.end();
    };

    socket.on('close', function() {
        parsers.free(parser);
    });
});

server.on('request', function(req, res) {

    // ignore favicon
    if (req.url === '/favicon.ico') {
        res.writeHead(404);
        return res.end();
    }

    var parsed = url.parse(req.url, true);

    // redirect main page to github reference
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

    // maximum number of tcp connections the client can setup
    // each tcp channel allows for more parallel requests
    var max_tcp_sockets = 4;

    // sockets is a list of available sockets for the connection
    // waiting is?
    var client = clients[id] = {
        sockets: [],
        waiting: []
    };

    var client_server = net.createServer();
    client_server.listen(function() {
        var port = client_server.address().port;
        log.info('tcp server listening on port: %d', port);

        var url = 'http://' + id + '.' + req.headers.host;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            url: url,
            id: id,
            port: port,
            max_conn_count: max_tcp_sockets
        }));
    });

    // user has 5 seconds to connect before their slot is given up
    var conn_timeout = setTimeout(function() {
        client_server.close();
    }, 5000);

    // no longer accepting connections for this id
    client_server.on('close', function() {
        delete clients[id];
    });

    var count = 0;
    client_server.on('connection', function(socket) {

        // no more socket connections allowed
        if (count++ >= max_tcp_sockets) {
            return socket.end();
        }

        log.trace('new connection for id: %s', id);

        // multiplexes socket data out to clients
        socket.ondata = socketOnData;

        // no need to close the client server
        clearTimeout(conn_timeout);

        // add socket to pool for this id
        var idx = client.sockets.push(socket) - 1;

        socket.on('close', function(had_error) {
            count--;
            client.sockets.splice(idx, 1);

            // no more sockets for this ident
            if (client.sockets.length === 0) {
                delete clients[id];
            }
        });

        // close will be emitted after this
        socket.on('error', function(err) {
            log.error(err);
        });
    });

    client_server.on('error', function(err) {
        log.error(err);
    });
});

module.exports = server;

