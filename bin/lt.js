#!/usr/bin/env node
/* eslint-disable no-console */

const openurl = require('openurl');
const yargs = require('yargs');

const localtunnel = require('../localtunnel');
const { version } = require('../package');

const { argv } = yargs
  .usage('Usage: lt --port [num] <options>')
  .env(true)
  .option('h', {
    alias: 'host',
    describe: 'Upstream server providing forwarding',
    default: 'https://localtunnel.me',
  })
  .option('s', {
    alias: 'subdomain',
    describe: 'Request this subdomain',
  })
  .option('l', {
    alias: 'local-host',
    describe: 'Tunnel traffic to this host instead of localhost, override Host header to this host',
  })
  .options('o', {
    alias: 'open',
    describe: 'Opens url in your browser',
  })
  .option('p', {
    alias: 'port',
    describe: 'Internal http server port',
  })
  .option('print-requests', {
    describe: 'Print basic request info',
  })
  .require('port')
  .boolean('print-requests')
  .help('help', 'Show this help and exit')
  .version(version);

if (typeof argv.port !== 'number') {
  yargs.showHelp();
  console.error('port must be a number');
  process.exit(1);
}

(async () => {
  const tunnel = await localtunnel({
    host: argv.host,
    port: argv.port,
    local_host: argv['local-host'],
    subdomain: argv.subdomain,
  }).catch(err => {
    throw err;
  });

  tunnel.on('error', err => {
    throw err;
  });

  console.log('your url is: %s', tunnel.url);
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
})();
