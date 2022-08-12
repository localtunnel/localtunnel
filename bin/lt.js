#!/usr/bin/env node
/* eslint-disable no-console */

const openurl = require('openurl');
const yargs = require('yargs');

const localtunnel = require('../localtunnel');
const config = require('../lib/config');
const { version } = require('../package');

const defaultHost = 'https://localtunnel.me';

const { argv } = yargs
  .usage('Usage: lt --port [num] <options>')
  .usage('Login: lt login [host]')
  .usage('Logout: lt logout [host]')
  .env(true)
  .command('$0', 'Start localtunnel session', () => {
    return yargs
      .option('p', {
        alias: 'port',
        describe: 'Internal HTTP server port',
      })
      .option('h', {
        alias: 'host',
        describe: 'Upstream server providing forwarding',
        default: defaultHost,
      })
      .option('s', {
        alias: 'subdomain',
        describe: 'Request this subdomain',
      })
      .option('l', {
        alias: 'local-host',
        describe: 'Tunnel traffic to this host instead of localhost, override Host header to this host',
      })
      .option('local-https', {
        describe: 'Tunnel traffic to a local HTTPS server',
      })
      .option('local-cert', {
        describe: 'Path to certificate PEM file for local HTTPS server',
      })
      .option('local-key', {
        describe: 'Path to certificate key file for local HTTPS server',
      })
      .option('local-ca', {
        describe: 'Path to certificate authority file for self-signed certificates',
      })
      .option('allow-invalid-cert', {
        describe: 'Disable certificate checks for your local HTTPS server (ignore cert/key/ca options)',
      })
      .options('o', {
        alias: 'open',
        describe: 'Opens the tunnel URL in your browser',
      })
      .option('print-requests', {
        describe: 'Print basic request info',
      })
      .boolean('local-https')
      .boolean('allow-invalid-cert')
      .boolean('print-requests')
  }, async (argv) => {
    if (typeof argv.port !== 'number') {
      yargs.showHelp();
      console.error('\nInvalid argument: `port` must be a number');
      process.exit(1);
    }

    const authorization = config.getAuthorization(argv.host);

    const tunnel = await localtunnel({
      port: argv.port,
      host: argv.host,
      subdomain: argv.subdomain,
      local_host: argv.localHost,
      local_https: argv.localHttps,
      local_cert: argv.localCert,
      local_key: argv.localKey,
      local_ca: argv.localCa,
      allow_invalid_cert: argv.allowInvalidCert,
      authorization,
    }).catch(err => {
      throw err;
    });

    tunnel.on('error', err => {
      throw err;
    });

    console.log('your url is: %s', tunnel.url);

    /**
     * `cachedUrl` is set when using a proxy server that support resource caching.
     * This URL generally remains available after the tunnel itself has closed.
     * @see https://github.com/localtunnel/localtunnel/pull/319#discussion_r319846289
     */
    if (tunnel.cachedUrl) {
      console.log('your cachedUrl is: %s', tunnel.cachedUrl);
    }

    if (argv.open) {
      openurl.open(tunnel.url);
    }

    if (argv['print-requests']) {
      tunnel.on('request', info => {
        console.log(new Date().toString(), info.method, info.path);
      });
    }
  })
  .command('login [host]', 'Add basic auth info for [host]', () => {
    return yargs.positional('host', {
      describe: 'Target basic auth host',
      default: defaultHost,
    })
  }, (argv) => {
    return config.login(argv.host)
  })
  .command('logout [host]', 'Remove basic auth info for [host]', () => {
    return yargs.positional('host', {
      describe: 'Target basic auth host',
      default: defaultHost,
    })
  }, (argv) => {
    return config.logout(argv.host)
  })
  .help('help', 'Show this help and exit')
  .version(version)
