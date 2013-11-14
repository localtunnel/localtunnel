var net = require('net');
var url = require('url');
var EventEmitter = require('events').EventEmitter;

var after = require('after');
var request = require('request');

// request upstream url and connection info
var request_url = function(params, cb) {
    request(params, function(err, res, body) {
        if (err) {
            return cb(err);
        }

        cb(null, body);
    });
};

var connect = function(opt) {
    var ev = new EventEmitter();

    // local host
    var local_host = opt.local_host;

    // local port
    var local_port = opt.port;

    var base_uri = opt.host + '/';

    // optionally override the upstream server
    var upstream = url.parse(opt.host);

    // no subdomain at first, maybe use requested domain
    var assigned_domain = opt.subdomain;

    // connect to upstream given connection parameters
    var tunnel = function (remote_host, remote_port, dead) {

        var remote_opt = {
            host: remote_host,
            port: remote_port
        };

        var local_opt = {
            host: local_host,
            port: local_port
        };

        var remote_attempts = 0;

        (function conn(conn_had_error) {
            if (conn_had_error) {
                return;
            }

            // we need a new tunnel
            if (++remote_attempts >= 3) {
                return dead();
            }

            // connection to localtunnel server
            var remote = net.connect(remote_opt);

            remote.once('error', function(err) {
                if (err.code !== 'ECONNREFUSED') {
                    remote.emit('error', err);
                }

                // retrying connection to local server
                setTimeout(conn, 1000);
            });

            function recon_local() {
                remote.pause();
                remote_attempts = 0;

                // connection to local http server
                var local = net.connect(local_opt);

                local.once('error', function(err) {
                    if (err.code !== 'ECONNREFUSED') {
                        local.emit('error', err);
                    }

                    // retrying connection to local server
                    setTimeout(recon_local, 1000);
                });

                local.once('connect', function() {
                    remote.resume();
                    remote.pipe(local).pipe(remote, {end: false});
                });

                local.once('close', function(had_error) {
                    if (had_error) {
                        return;
                    }
                    recon_local();
                });
            }

            remote.once('close', conn);
            remote.once('connect', recon_local);
        })();
    };

    var params = {
        path: '/',
        json: true
    };

    // where to quest
    params.uri = base_uri + ((assigned_domain) ? assigned_domain : '?new');

    function init_tunnel() {
        // get an id from lt server and setup forwarding tcp connections
        request_url(params, function(err, body) {
            if (err) {
                ev.emit('error', new Error('tunnel server not available: ' + err.message + ', retry 1s'));

                // retry interval for id request
                return setTimeout(function() {
                    init_tunnel();
                }, 1000);
            }

            // our assigned hostname and tcp port
            var port = body.port;
            var host = upstream.hostname;

            // store the id so we can try to get the same one
            assigned_domain = body.id;

            var max_conn = body.max_conn_count || 1;

            // after all our tunnels die, we ask for new ones
            // this might happen if the upstream server dies
            var dead = after(max_conn, function() {
                init_tunnel();
            });

            for (var count = 0 ; count < max_conn ; ++count) {
                tunnel(host, port, dead);
            }

            ev.emit('url', body.url);
        });
    }

    init_tunnel();

    return ev;
};

module.exports.connect = connect;

// for backwards compatibility
// old localtunnel modules had server and client code in same module
// so to keep .client working we expose it here
module.exports.client = module.exports;
