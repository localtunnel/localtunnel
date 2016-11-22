var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('localtunnel:client');

var Tunnel = require('./lib/Tunnel');

module.exports = function localtunnel(port, opt, fn) {
    if (typeof opt === 'function') {
        fn = opt;
        opt = {};
    }

    opt = opt || {};
    opt.port = port;

    var client = Tunnel(opt);

    // connect tunnel errors to the callback above
    client.on('error', fn);

    client.open(function(err) {
        if (err) {
            return fn(err);
        }

        fn(null, client);
    });
    return client;
};
