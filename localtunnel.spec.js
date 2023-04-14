/* eslint-disable no-console */

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const url = require('url');
const assert = require('assert');

const localtunnel = require('./localtunnel');

let fakePort;

before(async () => {
  const { promise, done } = defer();
  const server = http.createServer().unref();
  server.on('request', (req, res) => {
    res.write(req.headers.host);
    res.end();
  });
  server.listen(() => {
    const { port } = server.address();
    fakePort = port;
    done();
  });
  return promise;
});

it('query localtunnel server w/ ident', async () => {
  const { promise, done } = defer();

  const tunnel = await localtunnel({ port: fakePort });
  assert.ok(new RegExp('^https://.*(localtunnel\.me|loca\.lt)$').test(tunnel.url));

  const parsed = url.parse(tunnel.url);
  const opt = {
    host: parsed.host,
    port: 443,
    headers: { host: parsed.hostname },
    path: '/',
  };

  const req = https.request(opt, res => {
    res.setEncoding('utf8');
    let body = '';

    res.on('data', chunk => {
      body += chunk;
    });

    res.on('end', () => {
      assert(/.*(localtunnel\.me|loca\.lt)/.test(body), body);
      tunnel.close();
      done();
    });
  });

  req.end();
  return promise;
});

it('allows to validate the request', async () => {
  const { promise, done } = defer();

  const tunnel = await localtunnel({ port: fakePort, validate: (req) => req.path !== '/invalid' });

  const parsed = url.parse(tunnel.url);
  const opt = {
    host: parsed.host,
    port: 443,
    headers: { host: parsed.hostname },
    path: '/invalid',
  };

  const req = https.request(opt, res => {
    res.setEncoding('utf8');
    let body = '';

    res.on('data', chunk => {
      body += chunk;
    });

    res.on('end', () => {
      assert(res.statusCode === 403, res.statusCode);
      tunnel.close();
      done();
    });
  });

  req.end();
  return promise;
});

it('request specific domain', async () => {
  const subdomain = Math.random()
    .toString(36)
    .substr(2);
  const tunnel = await localtunnel({ port: fakePort, subdomain });
  assert.ok(new RegExp(`^https://${subdomain}.(localtunnel\.me|loca\.lt)$`).test(tunnel.url));
  tunnel.close();
});

describe('--local-host localhost', () => {
  it('override Host header with local-host', async () => {
    const { promise, done } = defer();

    const tunnel = await localtunnel({ port: fakePort, local_host: 'localhost' });
    assert.ok(new RegExp('^https://.*(localtunnel\.me|loca\.lt)$').test(tunnel.url));

    const parsed = url.parse(tunnel.url);
    const opt = {
      host: parsed.host,
      port: 443,
      headers: { host: parsed.hostname },
      path: '/',
    };

    const req = https.request(opt, res => {
      res.setEncoding('utf8');
      let body = '';

      res.on('data', chunk => {
        body += chunk;
      });

      res.on('end', () => {
        assert.strictEqual(body, 'localhost');
        tunnel.close();
        done();
      });
    });

    req.end();
    return promise;
  });
});

describe('--local-host 127.0.0.1', () => {
  it('override Host header with local-host', async () => {
    const { promise, done } = defer();

    const tunnel = await localtunnel({ port: fakePort, local_host: '127.0.0.1' });
    assert.ok(new RegExp('^https://.*(localtunnel\.me|loca\.lt)$').test(tunnel.url));

    const parsed = url.parse(tunnel.url);
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
        assert.strictEqual(body, '127.0.0.1');
        tunnel.close();
        done();
      });
    });

    req.end();
    return promise;
  });

  it('send chunked request', async () => {
    const { promise, done } = defer();

    const tunnel = await localtunnel({ port: fakePort, local_host: '127.0.0.1' });
    assert.ok(new RegExp('^https://.*(localtunnel\.me|loca\.lt)$').test(tunnel.url));

    const parsed = url.parse(tunnel.url);
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
        assert.strictEqual(body, '127.0.0.1');
        tunnel.close();
        done();
      });
    });

    req.end(crypto.randomBytes(1024 * 8).toString('base64'));
    return promise;
  });
});

function defer() {
  let done;
  const promise = new Promise(resolve => {
    done = resolve;
  });
  return { promise, done };
}
