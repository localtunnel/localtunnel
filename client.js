// builtin
var net = require('net');
var url = require('url');
var request = require('request');

var argv = require('optimist')
    .usage('Usage: $0 --port [num]')
    .demand(['port'])
    .options('host', {
        default: 'http://localtunnel.me',
        describe: 'upstream server providing forwarding'
    })
    .options('subdomain', {
        describe: 'request this subdomain'
    })
    .describe('port', 'internal http server port')
    .argv;

// local port
var local_port = argv.port;

// optionally override the upstream server
var upstream = url.parse(argv.host);

// query options
var opt = {
    host: upstream.hostname,
    port: upstream.port || 80,
    path: '/',
    json: true
};

var base_uri = 'http://' + opt.host + ':' + opt.port + opt.path;

var prev_id = argv.subdomain || '';

(function connect_proxy() {
    opt.uri = base_uri + ((prev_id) ? prev_id : '?new');

    request(opt, function(err, res, body) {
        if (err) {
            console.error('tunnel server not available: %s, retry 1s', err.message);

            // retry interval for id request
            return setTimeout(function() {
                connect_proxy();
            }, 1000);
        }

        // our assigned hostname and tcp port
        var port = body.port;
        var host = opt.host;
        var max_conn = body.max_conn_count || 1;

        // store the id so we can try to get the same one
        prev_id = body.id;

        console.log('your url is: %s', body.url);

        var count = 0;

        // open 5 connections to the localtunnel server
        // allows for resources to be served faster
        for (var count = 0 ; count < max_conn ; ++count) {
            var upstream = duplex(port, host, local_port, 'localhost');
            upstream.once('end', function() {
                // all upstream connections have been closed
                if (--count <= 0) {
                    connect_proxy();
                }
            });
        }
    });
})();

function duplex(port, host, local_port, local_host) {

    // connect to remote tcp server
    var upstream = net.createConnection(port, host);
    var internal = net.createConnection(local_port, local_host);

    // when upstream connection is closed, close other associated connections
    upstream.on('end', function() {
        console.log('> upstream connection terminated');

        // sever connection to internal server
        // on reconnect we will re-establish
        internal.end();
    });

    upstream.on('error', function(err) {
        console.error(err);
    });

    (function connect_internal() {

        //internal = net.createConnection(local_port);
        internal.on('error', function(err) {
            console.log('error connecting to local server. retrying in 1s');
            setTimeout(function() {
                connect_internal();
            }, 1000);
        });

        internal.on('end', function() {
            console.log('disconnected from local server. retrying in 1s');
            setTimeout(function() {
                connect_internal();
            }, 1000);
        });

        upstream.pipe(internal);
        internal.pipe(upstream);
    })();

    return upstream;
}


