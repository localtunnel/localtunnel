var net = require('net');
var url = require('url');
var EventEmitter = require('events').EventEmitter;

var request = require('request');
var debug = require('debug')('localtunnel:client');

// manages groups of tunnels
var TunnelCluster = function(opt) {
    if (!(this instanceof TunnelCluster)) {
        return new TunnelCluster(opt);
    }

    var self = this;
    self._opt = opt;

    EventEmitter.call(self);
};

TunnelCluster.prototype.__proto__ = EventEmitter.prototype;

// establish a new tunnel
TunnelCluster.prototype.open = function() {
    var self = this;

    var opt = self._opt || {};

    var remote_host = opt.remote_host;
    var remote_port = opt.remote_port;

    var local_host = opt.local_host;
    var local_port = opt.local_port;

    debug('establishing tunnel %s:%s <> %s:%s', local_host, local_port, remote_host, remote_port);

    // connection to localtunnel server
    var remote = net.connect({
        host: remote_host,
        port: remote_port
    });

    remote.once('error', function(err) {
        // emit connection refused errors immediately, because they
        // indicate that the tunnel can't be established.
        if (err.code === 'ECONNREFUSED') {
            self.emit('error', new Error('connection refused: ' + remote_host + ':' + remote_port + ' (check your firewall settings)'));
        }
        else {
            self.emit('error', err);
        }

        setTimeout(function() {
            self.emit('dead');
        }, 1000);
    });

    function conn_local() {
        debug('connecting locally to %s:%d', local_host, local_port);

        remote.pause();

        // connection to local http server
        var local = net.connect({
            host: local_host,
            port: local_port
        });

        function remote_close() {
            self.emit('dead');
            local.unpipe();
            local.end();
        };

        remote.once('close', remote_close);

        local.on('error', function(err) {
            local.end();

            remote.removeListener('close', remote_close);

            if (err.code !== 'ECONNREFUSED') {
                return local.emit('error', err);
            }

            // retrying connection to local server
            setTimeout(conn_local, 1000);
        });

        local.once('connect', function() {
            debug('connected locally');
            remote.resume();
            remote.pipe(local).pipe(remote);

            // when local closes, also get a new remote
            local.once('close', function(had_error) {
                remote.unpipe();
                local.unpipe();
                remote.end();
                debug('local connection closed [%s]', had_error);
            });
        });
    }

    // tunnel is considered open when remote connects
    remote.once('connect', function() {
        self.emit('open');
    });
    remote.once('connect', conn_local);
};

var init = function(opt, cb) {
    var ev = new EventEmitter();

    var params = {
        path: '/',
        json: true
    };

    var base_uri = opt.host + '/';

    // optionally override the upstream server
    var upstream = url.parse(opt.host);

    // no subdomain at first, maybe use requested domain
    var assigned_domain = opt.subdomain;

    // where to quest
    params.uri = base_uri + ((assigned_domain) ? assigned_domain : '?new');

    (function get_url() {
        request(params, function(err, res, body) {
            if (err) {
                ev.emit('error', new Error('tunnel server offline: ' + err.message + ', retry 1s'));

                return setTimeout(get_url, 1000);
            }

            var port = body.port;
            var host = upstream.hostname;

            var max_conn = body.max_conn_count || 1;

            cb(null, {
                remote_host: upstream.hostname,
                remote_port: body.port,
                name: body.id,
                url: body.url,
                max_conn: max_conn
            });
        });
    })();

    return ev;
};

module.exports.connect = function(opt) {
    var client = init(opt, function(err, info) {

        info.local_host = opt.local_host;
        info.local_port = opt.port;

        var tunnels = TunnelCluster(info);

        // only emit the url the first time
        tunnels.once('open', function() {
            client.emit('url', info.url);
        });

        var tunnel_count = 0;

        // track open count
        tunnels.on('open', function(tunnel) {
            tunnel_count++;
            debug('tunnel open [total: %d]', tunnel_count);
        });

        // when a tunnel dies, open a new one
        tunnels.on('dead', function() {
            tunnel_count--;
            debug('tunnel dead [total: %d]', tunnel_count);
            tunnels.open();
        });

        // establish as many tunnels as allowed
        for (var count = 0 ; count < info.max_conn ; ++count) {
            tunnels.open();
        }
    });

    return client;
};
