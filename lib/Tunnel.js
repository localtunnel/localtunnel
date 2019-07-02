var url = require('url');
var EventEmitter = require('events').EventEmitter;
var axios = require('axios');
var debug = require('debug')('localtunnel:client');

var TunnelCluster = require('./TunnelCluster');

var Tunnel = function(opt) {
    if (!(this instanceof Tunnel)) {
        return new Tunnel(opt);
    }

    var self = this;
    self._closed = false;
    self._opt = opt || {};

    self._opt.host = self._opt.host || 'https://localtunnel.me';
};

Tunnel.prototype.__proto__ = EventEmitter.prototype;

// initialize connection
// callback with connection info
Tunnel.prototype._init = function(cb) {
    var self = this;
    var opt = self._opt;

    var params = {
        responseType: 'json'
    };

    var base_uri = opt.host + '/';

    // optionally override the upstream server
    var upstream = url.parse(opt.host);

    // no subdomain at first, maybe use requested domain
    var assigned_domain = opt.subdomain;

    // where to quest
    var uri = base_uri + ((assigned_domain) ? assigned_domain : '?new');

    (function get_url() {
        axios.get(uri, params)
        .then(function(res){
            var body = res.data;
            debug('got tunnel information', res.data);
            if (res.status !== 200) {
                var err =  new Error((body && body.message) || 'localtunnel server returned an error, please try again');
                return cb(err);
            }
            var max_conn = body.max_conn_count || 1;
            cb(null, {
                remote_host: upstream.hostname,
                remote_ip: body.ip,
                remote_port: body.port,
                name: body.id,
                url: body.url,
                cachedUrl: body.cachedUrl,
                max_conn: max_conn,
                local_https: opt.https,
                local_cert: opt.cert,
                local_key: opt.key,
                local_ca: opt.ca
            });
        })
        .catch(function(err){
            debug('tunnel server offline: ' + err.message + ', retry 1s');
            return setTimeout(get_url, 1000);
        })
    })();
};

Tunnel.prototype._establish = function(info) {
    var self = this;
    var opt = self._opt;

    // increase max event listeners so that localtunnel consumers don't get
    // warning messages as soon as they setup even one listener. See #71
    self.setMaxListeners(info.max_conn + (EventEmitter.defaultMaxListeners || 10));

    info.local_host = opt.local_host;
    info.local_port = opt.port;

    var tunnels = self.tunnel_cluster = TunnelCluster(info);

    // only emit the url the first time
    tunnels.once('open', function() {
        self.emit('url', info.url);
    });

    // re-emit socket error
    tunnels.on('error', function(err) {
        debug('got socket error', err.message)
        self.emit('error', err);
    });

    var tunnel_count = 0;

    // track open count
    tunnels.on('open', function(tunnel) {
        tunnel_count++;
        debug('tunnel open [total: %d]', tunnel_count);

        var close_handler = function() {
            tunnel.destroy();
        };

        if (self._closed) {
            return close_handler();
        }

        self.once('close', close_handler);
        tunnel.once('close', function() {
            self.removeListener('close', close_handler);
        });
    });

    // when a tunnel dies, open a new one
    tunnels.on('dead', function(tunnel) {
        tunnel_count--;
        debug('tunnel dead [total: %d]', tunnel_count);

        if (self._closed) {
            return;
        }

        tunnels.open();
    });

    tunnels.on('request', function(info) {
        self.emit('request', info);
    });

    // establish as many tunnels as allowed
    for (var count = 0 ; count < info.max_conn ; ++count) {
        tunnels.open();
    }
};

Tunnel.prototype.open = function(cb) {
    var self = this;

    self._init(function(err, info) {
        if (err) {
            return cb(err);
        }

        self.clientId = info.name;
        self.url = info.url;
        self.cachedUrl = info.cachedUrl;
        self._establish(info);
        cb();
    });
};

// shutdown tunnels
Tunnel.prototype.close = function() {
    var self = this;

    self._closed = true;
    self.emit('close');
};

module.exports = Tunnel;
