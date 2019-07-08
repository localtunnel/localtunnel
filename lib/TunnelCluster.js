var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('localtunnel:client');
var fs = require('fs');
var net = require('net');
var path = require('path');
var tls = require('tls');

var HeaderHostTransformer = require('./HeaderHostTransformer');

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

    // Preference IP if returned by the server
    var remote_host_or_ip = opt.remote_ip || opt.remote_host
    var remote_port = opt.remote_port;

    var local_host = opt.local_host || 'localhost';
    var local_port = opt.local_port;
    var local_protocol = opt.local_https ? 'https' : 'http'

    debug('establishing tunnel %s://%s:%s <> %s:%s', local_protocol, local_host, local_port, remote_host_or_ip, remote_port);

    // connection to localtunnel server
    var remote = net.connect({
        host: remote_host_or_ip,
        port: remote_port
    });

    remote.setKeepAlive(true);

    remote.on('error', function(err) {
        debug('got remote connection error', err.message);
        
        // emit connection refused errors immediately, because they
        // indicate that the tunnel can't be established.
        if (err.code === 'ECONNREFUSED') {
            self.emit('error', new Error('connection refused: ' + remote_host_or_ip + ':' + remote_port + ' (check your firewall settings)'));
        }

        remote.end();
    });

    function conn_local() {
        if (remote.destroyed) {
            debug('remote destroyed');
            self.emit('dead');
            return;
        }

        debug('connecting locally to %s://%s:%d', local_protocol, local_host, local_port);
        remote.pause();

        var allow_invalid_certificate = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
        if (allow_invalid_certificate) debug('allowing invalid certificates')

        var get_local_cert_opts = () => allow_invalid_certificate
            ? { rejectUnauthorized: false }
            : {
                cert: fs.readFileSync(opt.local_cert),
                key: fs.readFileSync(opt.local_key),
                ca: opt.local_ca ? [fs.readFileSync(opt.local_ca)] : undefined
            }

        // connection to local http server
        var local = opt.local_https
            ? tls.connect({ host: local_host, port: local_port, ...get_local_cert_opts() })
            : net.connect({ host: local_host, port: local_port });

        function remote_close() {
            debug('remote close');
            self.emit('dead');
            local.end();
        };

        remote.once('close', remote_close);

        // TODO some languages have single threaded servers which makes opening up
        // multiple local connections impossible. We need a smarter way to scale
        // and adjust for such instances to avoid beating on the door of the server
        local.once('error', function(err) {
            debug('local error %s', err.message);
            local.end();

            remote.removeListener('close', remote_close);

            if (err.code !== 'ECONNREFUSED') {
                return remote.end();
            }

            // retrying connection to local server
            setTimeout(conn_local, 1000);
        });

        local.once('connect', function() {
            debug('connected locally');
            remote.resume();

            var stream = remote;

            // if user requested specific local host
            // then we use host header transform to replace the host header
            if (opt.local_host) {
                debug('transform Host header to %s', opt.local_host);
                stream = remote.pipe(HeaderHostTransformer({ host: opt.local_host }));
            }

            stream.pipe(local).pipe(remote);

            // when local closes, also get a new remote
            local.once('close', function(had_error) {
                debug('local connection closed [%s]', had_error);
            });
        });
    }

    remote.on('data', function(data) {
        const match = data.toString().match(/^(\w+) (\S+)/);
        if (match) {
            self.emit('request', {
                method: match[1],
                path: match[2],
            });
        }
    });

    // tunnel is considered open when remote connects
    remote.once('connect', function() {
        self.emit('open', remote);
        conn_local();
    });
};

module.exports = TunnelCluster;
