import assert from 'assert'
import crypto from 'crypto'
import http from 'http'
import https from 'https'

import { AddressInfo } from 'net'
import localtunnel from './localtunnel.js'

let fakePort;

describe("localtunnel", function() {

  before(function(done) {
    const server = http.createServer();
    server.on('request', (req, res) => {
      res.write(req.headers.host);
      res.end();
    });
    server.listen(() => {
      const addr = server.address() as AddressInfo
      fakePort = addr.port;
      done();
    });
  });

  it('query localtunnel server w/ ident', async function(done) {
    const tunnel = await localtunnel({ port: fakePort });
    assert.ok(new RegExp('^https://.*localtunnel.me$').test(tunnel.getURL()));

    const parsed = new URL(tunnel.getURL());
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
        assert(/.*[.]localtunnel[.]me/.test(body), body);
        tunnel.close();
        done();
      });
    });

    req.end();
  });

  it('request specific domain', async function() {
    const subdomain = Math.random()
      .toString(36)
      .substr(2);
    const tunnel = await localtunnel({ port: fakePort, subdomain });
    assert.ok(new RegExp(`^https://${subdomain}.localtunnel.me$`).test(tunnel.getURL()));
    tunnel.close();
  });

  describe('--local-host localhost', function() {
    it('override Host header with local-host', async function(done) {
      const tunnel = await localtunnel({ port: fakePort, local_host: 'localhost' });
      assert.ok(new RegExp('^https://.*localtunnel.me$').test(tunnel.getURL()));

      const parsed = new URL(tunnel.getURL());
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
    });
  });

  describe('--local-host 127.0.0.1', function() {
    it('override Host header with local-host', async function(done) {
      const tunnel = await localtunnel({ port: fakePort, local_host: '127.0.0.1' });
      assert.ok(new RegExp('^https://.*localtunnel.me$').test(tunnel.getURL()));

      const parsed = new URL(tunnel.getURL());
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
    });

    it('send chunked request', async function(done) {
      const tunnel = await localtunnel({ port: fakePort, local_host: '127.0.0.1' });
      assert.ok(new RegExp('^https://.*localtunnel.me$').test(tunnel.getURL()));

      const parsed = new URL(tunnel.getURL());
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
    });
  });

})