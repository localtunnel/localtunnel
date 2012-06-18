
// builtin
var http = require('http');
var net = require('net');
var FreeList = require('freelist').FreeList;

// here be dragons
var HTTPParser = process.binding('http_parser').HTTPParser;
var ServerResponse = http.ServerResponse;
var IncomingMessage = http.IncomingMessage;

var log = require('book');

var chars = 'abcdefghiklmnopqrstuvwxyz';
function rand_id() {
    var randomstring = '';
    for (var i=0; i<4; ++i) {
        var rnum = Math.floor(Math.random() * chars.length);
        randomstring += chars[rnum];
    }

    return randomstring;
}

var server = http.createServer();

// id -> client http server
var clients = {};

// id -> list of sockets waiting for a valid response
var wait_list = {};

var parsers = http.parsers;

// data going back to a client (the last client that made a request)
function socketOnData(d, start, end) {

    var socket = this;
    var req = this._httpMessage;

    var current = clients[socket.subdomain].current;

    if (!current) {
        log.error('no current for http response from backend');
        return;
    }

    // send the goodies
    current.write(d.slice(start, end));

    // invoke parsing so we know when all the goodies have been sent
    var parser = current.out_parser;
    parser.socket = socket;

    var ret = parser.execute(d, start, end - start);
    if (ret instanceof Error) {
        debug('parse error');
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

    var for_client = false;
    var client_id;

    var request;

    //var parser = new HTTPParser(HTTPParser.REQUEST);
    var parser = parsers.alloc();
    parser.socket = socket;
    parser.reinitialize(HTTPParser.REQUEST);

    // a full request is complete
    // we wait for the response from the server
    parser.onIncoming = function(req, shouldKeepAlive) {

        log.trace('request', req.url);
        request = req;

        for_client = false;

        var hostname = req.headers.host;
        var match = hostname.match(/^([a-z]{4})[.].*/);

        if (!match) {
            // normal processing if not proxy
            var res = new ServerResponse(req);
            res.assignSocket(parser.socket);
            self.emit('request', req, res);
            return;
        }

        client_id = match[1];
        for_client = true;

        var out_parser = parsers.alloc();
        out_parser.reinitialize(HTTPParser.RESPONSE);
        socket.out_parser = out_parser;

        // we have a response
        out_parser.onIncoming = function(res) {
            res.on('end', function() {
                log.trace('done with response for: %s', req.url);

                // done with the parser
                parsers.free(out_parser);

                var next = wait_list[client_id].shift();

                clients[client_id].current = next;

                if (!next) {
                    return;
                }

                // write original bytes that we held cause client was busy
                clients[client_id].write(next.queue);
                next.resume();
            });
        };
    };

    // process new data on the client socket
    // we may need to forward this it the backend
    socket.ondata = function(d, start, end) {
        var ret = parser.execute(d, start, end - start);

        // invalid request from the user
        if (ret instanceof Error) {
            debug('parse error');
            socket.destroy(ret);
            return;
        }

        // only write data if previous request to this client is done?
        log.trace('%s %s', parser.incoming && parser.incoming.upgrade, for_client);

        // what if the subdomains are treated differently
        // as individual channels to the backend if available?
        // how can I do that?

        if (parser.incoming && parser.incoming.upgrade) {
            // websocket shit
        }

        // wtf do you do with upgraded connections?

        // forward the data to the backend
        if (for_client) {
            var client = clients[client_id];

            // requesting a subdomain that doesn't exist
            if (!client) {
                return;
            }

            // if the client is already processing something
            // then new connections need to go into pause mode
            // and when they are revived, then they can send data along
            if (client.current && client.current !== socket) {
                log.trace('pausing', request.url);
                // prevent new data from gathering for this connection
                // we are waiting for a response to a previous request
                socket.pause();

                var copy = Buffer(end - start);
                d.copy(copy, 0, start, end);
                socket.queue = copy;

                wait_list[client_id].push(socket);

                return;
            }

            // this socket needs to receive responses
            client.current = socket;

            // send through tcp tunnel
            client.write(d.slice(start, end));
        }
    };

    socket.onend = function() {
        var ret = parser.finish();

        if (ret instanceof Error) {
            log.trace('parse error');
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

    // generate new shit for client
    var id = rand_id();

    if (wait_list[id]) {
        wait_list[id].forEach(function(waiting) {
            waiting.end();
        });
    }

    var client_server = net.createServer();
    client_server.listen(function() {
        var port = client_server.address().port;
        log.info('tcp server listening on port: %d', port);

        var url = 'http://' + id + '.' + req.headers.host;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url: url, port: port }));
    });

    // user has 5 seconds to connect before their slot is given up
    var conn_timeout = setTimeout(function() {
        client_server.close();
    }, 5000);

    client_server.on('connection', function(socket) {

        // who the info should route back to
        socket.subdomain = id;

        // multiplexes socket data out to clients
        socket.ondata = socketOnData;

        clearTimeout(conn_timeout);

        log.trace('new connection for id: %s', id);
        clients[id] = socket;
        wait_list[id] = [];

        socket.on('end', function() {
            delete clients[id];
        });
    });

    client_server.on('err', function(err) {
        log.error(err);
    });
});

server.listen(8000);

