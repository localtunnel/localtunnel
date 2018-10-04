var url = require('url');
var EventEmitter = require('events').EventEmitter;
var axios = require('axios');
var debug = require('debug')('localtunnel:client');
var ssh_tunnel = require('tunnel-ssh')

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
            if (res.status !== 200) {
                var err =  new Error((body && body.message) || 'localtunnel server returned an error, please try again');
                return cb(err);
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
        })
        .catch(function(err){
            // TODO (shtylman) don't print to stdout?
            console.log('tunnel server offline: ' + err.message + ', retry 1s');
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
    info.use_ssh = (opt.ssh_host!==undefined);

    
    if(opt.ssh_host !== undefined){
        var ssh_config;
        
        if(opt.ssh_pass !== undefined){
            console.log("Using SSH tunnel to connect to localtunnel server by password");

            ssh_config = {
                username:opt.ssh_user,
                password:opt.ssh_pass,
                host:opt.ssh_host,
                port:opt.ssh_port,
                dstHost:'localhost',
                dstPort:info.remote_port,
                localHost:'127.0.0.1',
                localPort: info.remote_port,
                self: self
            };

        }else{
            console.log("Using SSH tunnel to connect to localtunnel server by private key");

            ssh_config = {
                privateKey:require('fs').readFileSync(opt.ssh_key),
                passphrase:opt.ssh_key_pass,
                host:opt.ssh_host,
                port:opt.ssh_port,
                dstHost:'localhost',
                dstPort:info.remote_port,
                localHost:'127.0.0.1',
                localPort: info.remote_port,
                self: self
            };

        }

        ssh_tunnel(ssh_config, function (error, server) {

            if(error){
                throw error;
            }else{
                console.log("SSH Tunnel connected");
                self._startTunnel(self,info);
            }
        });  
    }
    else{
        this._startTunnel(self,info);
    }
    
};

Tunnel.prototype._startTunnel = function(self,info){
    var tunnels = self.tunnel_cluster = TunnelCluster(info);

    // only emit the url the first time
    tunnels.once('open', function() {
        self.emit('url', info.url);
    });

    // re-emit socket error
    tunnels.on('error', function(err) {
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
}

Tunnel.prototype.open = function(cb) {
    var self = this;

    self._init(function(err, info) {
        if (err) {
            return cb(err);
        }

        self.url = info.url;
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
