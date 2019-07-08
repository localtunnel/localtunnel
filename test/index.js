/* eslint-disable no-console */

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const url = require('url');
const assert = require('assert');

const localtunnel = require('../');

test('setup local http server', done => {
  const server = http.createServer();
  server.on('request', (req, res) => {
    res.write(req.headers.host);
    res.end();
  });

  server.listen(() => {
    const { port } = server.address();
    test.fakePort = port;
    console.log('local http on:', port);
    done();
  });
});

test('setup localtunnel client', done => {
  localtunnel(test.fakePort, (err, tunnel) => {
    assert.ifError(err);
    assert.ok(new RegExp('^https://.*localtunnel.me$').test(tunnel.url));
    test.fakeUrl = tunnel.url;
    done();
  });
});

test('query localtunnel server w/ ident', done => {
  const uri = test.fakeUrl;
  const parsed = url.parse(uri);

  const opt = {
    host: parsed.host,
    port: 443,
    headers: {
      host: parsed.hostname,
    },
    path: '/',
  };

  const req = https.request(opt, res => {
    res.setEncoding('utf8');
    let body = '';

    res.on('data', chunk => {
      body += chunk;
    });

    res.on('end', () => {
      assert(/.*[.]localtunnel[.]me/.test(body), body);
      done();
    });
  });

  req.end();
});

test('request specific domain', done => {
  localtunnel(test.fakePort, { subdomain: 'abcd' }, (err, tunnel) => {
    assert.ifError(err);
    assert.ok(new RegExp('^https://abcd.localtunnel.me$').test(tunnel.url));
    tunnel.close();
    done();
  });
});

describe('--local-host localhost', () => {
  test('setup localtunnel client', done => {
    const opt = {
      local_host: 'localhost',
    };
    localtunnel(test.fakePort, opt, (err, tunnel) => {
      assert.ifError(err);
      assert.ok(new RegExp('^https://.*localtunnel.me$').test(tunnel.url));
      test.fakeUrl = tunnel.url;
      done();
    });
  });

  test('override Host header with local-host', done => {
    const uri = test.fakeUrl;
    const parsed = url.parse(uri);

    const opt = {
      host: parsed.host,
      port: 443,
      headers: {
        host: parsed.hostname,
      },
      path: '/',
    };

    const req = https.request(opt, res => {
      res.setEncoding('utf8');
      let body = '';

      res.on('data', chunk => {
        body += chunk;
      });

      res.on('end', () => {
        assert.equal(body, 'localhost');
        done();
      });
    });

    req.end();
  });
});

describe('--local-host 127.0.0.1', () => {
  test('setup localtunnel client', done => {
    const opt = {
      local_host: '127.0.0.1',
    };
    localtunnel(test.fakePort, opt, (err, tunnel) => {
      assert.ifError(err);
      assert.ok(new RegExp('^https://.*localtunnel.me$').test(tunnel.url));
      test.fakeUrl = tunnel.url;
      done();
    });
  });

  test('override Host header with local-host', done => {
    const uri = test.fakeUrl;
    const parsed = url.parse(uri);

    const opt = {
      host: parsed.host,
      port: 443,
      headers: {
        host: parsed.hostname,
      },
      path: '/',
    };

    const req = https.request(opt, res => {
      res.setEncoding('utf8');
      let body = '';

      res.on('data', chunk => {
        body += chunk;
      });

      res.on('end', () => {
        assert.equal(body, '127.0.0.1');
        done();
      });
    });

    req.end();
  });

  test('send chunked request', done => {
    const uri = test.fakeUrl;
    const parsed = url.parse(uri);

    const opt = {
      host: parsed.host,
      port: 443,
      headers: {
        host: parsed.hostname,
        'Transfer-Encoding': 'chunked',
      },
      path: '/',
    };

    const req = https.request(opt, res => {
      res.setEncoding('utf8');
      let body = '';

      res.on('data', chunk => {
        body += chunk;
      });

      res.on('end', () => {
        assert.equal(body, '127.0.0.1');
        done();
      });
    });

    req.end(crypto.randomBytes(1024 * 8).toString('base64'));
  });
});
