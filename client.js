// builtin
var net = require('net');
var url = require('url');
var request = require('request');
var EventEmitter = require('events').EventEmitter;

// request upstream url and connection info
var request_url = function(params, cb) {
    request(params, function(err, res, body) {
        if (err) {
            cb(err);
        }

        cb(null, body);
    });
};

var connect = function(opt) {
    var ev = new EventEmitter();

    // local port
    var local_port = opt.port;

    var base_uri = opt.host + '/';

    // optionally override the upstream server
    var upstream = url.parse(opt.host);

    // no subdomain at first, maybe use requested domain
    var assigned_domain = opt.subdomain;

    // connect to upstream given connection parameters
    var tunnel = function (remote_host, remote_port, max_conn) {
        var count = 0;

        // open 5 connections to the localtunnel server
        // allows for resources to be served faster
        for (var count = 0 ; count < max_conn ; ++count) {
            var upstream = duplex(remote_host, remote_port, 'localhost', local_port);
            upstream.once('end', function() {
                // all upstream connections have been closed
                if (--count <= 0) {
                    tunnel(remote_host, remote_port, max_conn);
                }
            });

            upstream.on('error', function(err) {
                console.error(err);
            });
        }
    };

    var params = {
        path: '/',
        json: true
    };

    // where to quest
    params.uri = base_uri + ((assigned_domain) ? assigned_domain : '?new');

    request_url(params, function(err, body) {

        if (err) {
            ev.emit('error', new Error('tunnel server not available: %s, retry 1s', err.message));

            // retry interval for id request
            return setTimeout(function() {
                connect_proxy(opt);
            }, 1000);
        }

        // our assigned hostname and tcp port
        var port = body.port;
        var host = upstream.hostname;

        // store the id so we can try to get the same one
        assigned_domain = body.id;

        tunnel(host, port, body.max_conn_count || 1);

        ev.emit('url', body.url);
    });

    return ev;
};

var duplex = function(remote_host, remote_port, local_host, local_port) {
    var ev = new EventEmitter();

    // connect to remote tcp server
    var upstream = net.createConnection(remote_port, remote_host);
    var internal;

    // when upstream connection is closed, close other associated connections
    upstream.once('end', function() {
        ev.emit('error', new Error('upstream connection terminated'));

        // sever connection to internal server
        // on reconnect we will re-establish
        internal.end();

        ev.emit('end');
    });

    upstream.on('error', function(err) {
        ev.emit('error', err);
    });

    (function connect_internal() {

        internal = net.createConnection(local_port, local_host);
        internal.on('error', function() {
            ev.emit('error', new Error('error connecting to local server. retrying in 1s'));
            setTimeout(function() {
                connect_internal();
            }, 1000);
        });

        internal.on('end', function() {
            ev.emit('error', new Error('disconnected from local server. retrying in 1s'));
            setTimeout(function() {
                connect_internal();
            }, 1000);
        });

        upstream.pipe(internal).pipe(upstream);
    })();

    return ev;
}

module.exports.connect = connect;

