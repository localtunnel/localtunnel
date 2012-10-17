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

var internal;
var upstream;
var prev_id;

(function connect_proxy() {
    opt.uri = base_uri + ((prev_id) ? prev_id : '?new');

    request(opt, function(err, res, body) {
        if (err) {
            console.error('upstream not available: %s', err.message);
            return process.exit(-1);
        }

        // our assigned hostname and tcp port
        var port = body.port;
        var host = opt.host;

        // store the id so we can try to get the same one
        prev_id = body.id;

        console.log('your url is: %s', body.url);

        // connect to remote tcp server
        upstream = net.createConnection(port, host);

        // reconnect internal
        connect_internal();

        upstream.on('end', function() {
            console.log('> upstream connection terminated');

            // sever connection to internal server
            // on reconnect we will re-establish
            internal.end();

            setTimeout(function() {
                connect_proxy();
            }, 1000);
        });
    });
})();

function connect_internal() {

    internal = net.createConnection(local_port);
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
}

