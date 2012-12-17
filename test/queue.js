var http = require('http');
var url = require('url');
var assert = require('assert');

var localtunnel_server = require('../').server({
    max_tcp_sockets: 1
});

var localtunnel_client = require('../').client;

var server;

test('setup localtunnel server', function(done) {
    localtunnel_server.listen(3000, function() {
        console.log('lt server on:', 3000);
        done();
    });
});

test('setup local http server', function(done) {
    server = http.createServer();
    server.on('request', function(req, res) {
        // respond sometime later
        setTimeout(function() {
            res.setHeader('x-count', req.headers['x-count']);
            res.end('foo');
        }, 100);
    });

    server.listen(function() {
        var port = server.address().port;

        test._fake_port = port;
        console.log('local http on:', port);
        done();
    });
});

test('setup localtunnel client', function(done) {
    var client = localtunnel_client.connect({
        host: 'http://localhost:' + 3000,
        port: test._fake_port
    });

    client.on('url', function(url) {
        assert.ok(/^http:\/\/.*localhost:3000$/.test(url));
        test._fake_url = url;
        done();
    });

    client.on('error', function(err) {
        console.error(err);
    });
});

test('query localtunnel server w/ ident', function(done) {
    var uri = test._fake_url;
    var hostname = url.parse(uri).hostname;

    var count = 0;
    var opt = {
        host: 'localhost',
        port: 3000,
        agent: false,
        headers: {
            host: hostname
        },
        path: '/'
    }

    var num_requests = 2;
    var responses = 0;

    function maybe_done() {
        if (++responses >= num_requests) {
            done();
        }
    }

    function make_req() {
        opt.headers['x-count'] = count++;
        http.get(opt, function(res) {
            res.setEncoding('utf8');
            var body = '';

            res.on('data', function(chunk) {
                body += chunk;
            });

            res.on('end', function() {
                assert.equal('foo', body);
                maybe_done();
            });
        });
    }

    for (var i=0 ; i<num_requests ; ++i) {
        make_req();
    }
});

test('shutdown', function() {
    localtunnel_server.close();
});

