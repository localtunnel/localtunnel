#!/usr/bin/env node
/* eslint-disable no-console */

const openurl = require('openurl');
const yargs = require('yargs');

const localtunnel = require('../localtunnel');
const { version } = require('../package');

const { argv } = yargs
  .usage('Usage: lt --port [num] <options>')
  .env(true)
  .option('p', {
    alias: 'port',
    describe: 'Internal HTTP server port',
  })
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
  .option('max-reconnect', {
    describe: 'Maximum number of reconnection attempts',
    type: 'number',
    default: 10,
  })
  .option('reconnect-backoff', {
    describe: 'Initial delay in milliseconds between reconnection attempts (doubles with each attempt)',
    type: 'number',
    default: 1000,
  })
  .option('detailed-logs', {
    describe: 'Enable detailed request logging with timestamps and headers',
    type: 'boolean',
    default: false,
  })
  .option('status-monitor', {
    describe: 'Display periodic connection status updates',
    type: 'boolean',
    default: false,
  })
  .option('request-log-size', {
    describe: 'Maximum number of requests to keep in memory',
    type: 'number',
    default: 100,
  })
  .require('port')
  .boolean('local-https')
  .boolean('allow-invalid-cert')
  .boolean('print-requests')
  .boolean('detailed-logs')
  .boolean('status-monitor')
  .help('help', 'Show this help and exit')
  .version(version);

if (typeof argv.port !== 'number') {
  yargs.showHelp();
  console.error('\nInvalid argument: `port` must be a number');
  process.exit(1);
}

// Format a timestamp nicely
const formatTimestamp = (timestamp) => {
  if (typeof timestamp === 'string') {
    return timestamp;
  }
  const date = new Date(timestamp);
  return date.toISOString();
};

// Format time duration in human readable form
const formatDuration = (ms) => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  if (ms < 60000) {
    return `${Math.floor(ms / 1000)}s`;
  }
  
  if (ms < 3600000) {
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
};

(async () => {
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
    maxReconnectAttempts: argv.maxReconnect,
    reconnectBackoff: argv.reconnectBackoff,
    maxRequestLogSize: argv.requestLogSize,
  }).catch(err => {
    throw err;
  });

  tunnel.on('error', err => {
    console.error('\x1b[31mError:\x1b[0m', err.message);
    if (!argv.maxReconnect) {
      throw err;
    }
  });

  console.log('\x1b[32m%s\x1b[0m', `LocalTunnel v${version} started!`);
  console.log('Your tunnel URL: \x1b[36m%s\x1b[0m', tunnel.url);

  /**
   * `cachedUrl` is set when using a proxy server that support resource caching.
   * This URL generally remains available after the tunnel itself has closed.
   * @see https://github.com/localtunnel/localtunnel/pull/319#discussion_r319846289
   */
  if (tunnel.cachedUrl) {
    console.log('Your cached URL: \x1b[36m%s\x1b[0m', tunnel.cachedUrl);
  }

  if (argv.open) {
    openurl.open(tunnel.url);
  }

  if (argv.statusMonitor) {
    tunnel.on('status', (status) => {
      console.log('\n\x1b[33m--- Tunnel Status Update ---\x1b[0m');
      console.log('\x1b[36mStatus:\x1b[0m %s', status.status);
      console.log('\x1b[36mLast Activity:\x1b[0m %s (%s ago)', 
        formatTimestamp(status.lastActive),
        formatDuration(status.idleTime));
      if (status.reconnectAttempts > 0) {
        console.log('\x1b[36mReconnection Attempts:\x1b[0m %d', status.reconnectAttempts);
      }
    });
    
    tunnel.on('connecting', () => {
      console.log('\x1b[33mConnecting to tunnel server...\x1b[0m');
    });
    
    tunnel.on('connected', (info) => {
      console.log('\x1b[32mConnected successfully to: \x1b[36m%s\x1b[0m', info.url);
    });
    
    tunnel.on('reconnecting', (info) => {
      console.log('\x1b[33mReconnecting (Attempt %d) in %s...\x1b[0m',
        info.attempt, formatDuration(info.delay));
    });
    
    tunnel.on('reconnected', (info) => {
      console.log('\x1b[32mReconnected successfully to: \x1b[36m%s\x1b[0m', info.url);
    });
    
    tunnel.on('reconnect_error', (err) => {
      console.error('\x1b[31mReconnection Error:\x1b[0m', err.message);
    });
  }

  if (argv.printRequests || argv.detailedLogs) {
    tunnel.on('request', info => {
      if (argv.detailedLogs) {
        console.log('\x1b[35m%s\x1b[0m \x1b[33m%s\x1b[0m \x1b[36m%s\x1b[0m (Request #%d)',
          formatTimestamp(info.timestamp),
          info.method,
          info.path,
          info.id
        );
      } else {
        console.log('\x1b[33m%s\x1b[0m \x1b[36m%s\x1b[0m',
          info.method,
          info.path
        );
      }
    });
  }
  
  // Handle termination signals
  const cleanup = () => {
    console.log('\n\x1b[33mClosing tunnel...\x1b[0m');
    tunnel.close();
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
})();
