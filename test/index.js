var http = require('http');
var https = require('https');
var url = require('url');
var assert = require('assert');

var localtunnel = require('../');

test('setup local http server', function(done) {
    var server = http.createServer();
    server.on('request', function(req, res) {
        res.write('foo');
        res.end();
    });
    server.listen(function() {
        var port = server.address().port;

        test._fake_port = port;
        console.log('local http on:', port);
        done();
    });
});

test('setup localtunnel client', function(done) {
    var client = localtunnel({
        port: test._fake_port
    });

    client.on('url', function(url) {
        assert.ok(new RegExp('^https:\/\/.*localtunnel.me' + '$').test(url));
        test._fake_url = url;
        done();
    });

    client.on('error', function(err) {
        done(err);
    });
});

test('query localtunnel server w/ ident', function(done) {
    var uri = test._fake_url;
    var parsed = url.parse(uri);

    var opt = {
        host: parsed.host,
        port: 443,
        headers: {
            host: parsed.hostname
        },
        path: '/'
    };

    var req = https.request(opt, function(res) {
        res.setEncoding('utf8');
        var body = '';

        res.on('data', function(chunk) {
            body += chunk;
        });

        res.on('end', function() {
            assert.equal('foo', body);
            done();
        });
    });

    req.end();
});

test('request specific domain', function(done) {
    var client = localtunnel({
        port: test._fake_port,
        subdomain: 'abcd'
    });

    client.on('url', function(url) {
        assert.ok(new RegExp('^https:\/\/abcd.localtunnel.me' + '$').test(url));
        client.close();
        done();
    });

    client.on('error', function(err) {
        console.error(err);
    });
});
