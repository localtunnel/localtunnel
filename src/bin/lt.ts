#!./node_modules/.bin/tsx

import 'dotenv/config';

import { InvalidArgumentError, Option, program } from 'commander';
import openurl from 'openurl';
import pkg from '../../package.json' with { type: "json" };
import { newLogger } from '../lib/logger.js';
import { sleep } from '../lib/utils.js';
import localtunnel from '../localtunnel.js';

const logger = newLogger('lt')

type CliOpts = {
  host?: string
  port: number
  subdomain?: string
  localHost?: string
  localHostname?: string
  localHttps?: string
  localCert?: string
  localKey?: string
  localCa?: string
  allowInvalidCert?: boolean
  open?: boolean
  printRequests?: boolean
  secret?: string
}

let lock = false

const runClient = async (argv: CliOpts) => {

  if (typeof argv.port !== 'number') {
    logger.error('Invalid argument: `port` must be a number');
    process.exit(1);
  }

  if (lock) return
  lock = true

  const tunnel = await localtunnel({
    port: argv.port,
    host: argv.host,
    subdomain: argv.subdomain,
    local_host: argv.localHost,
    local_hostname: argv.localHostname,
    local_https: argv.localHttps,
    local_cert: argv.localCert,
    local_key: argv.localKey,
    local_ca: argv.localCa,
    allow_invalid_cert: argv.allowInvalidCert,
    secret: argv.secret,
  }, false)
  
  tunnel.on('error', async (err) => {
    logger.error(err.message)
    // logger.debug(err.stack)

    await tunnel.close()
  });
  
  tunnel.once('close', async () => {
    if (lock && !tunnel.isClosed()) return
    logger.info(`Restarting tunnel`)
    await sleep(5000)
    await runClient(argv)
  })

  if (argv.printRequests) {
    tunnel.on('request', info => {
      logger.log(new Date().toString(), info.method, info.path);
    });
  }

  // starts now
  await tunnel.open()
  lock = false

  if (!tunnel.isClosed()) {
    logger.info(`your url is: ${tunnel.getURL()}`);
    /**
     * `cachedUrl` is set when using a proxy server that support resource caching.
     * This URL generally remains available after the tunnel itself has closed.
     * @see https://github.com/localtunnel/localtunnel/pull/319#discussion_r319846289
     */
    if (tunnel.getCachedURL()) {
      logger.info(`your cachedUrl is: ${tunnel.getCachedURL()}`);
    }
  
    if (argv.open) {
      openurl.open(tunnel.getURL());
    }
  }

}

const main = async () => {

  const intParser = (value) => {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      throw new InvalidArgumentError('Not a number.');
    }
    return parsedValue;
  }

  const portOption = new Option(
    '--port, -p <number>', 'Internal HTTP server port'
  )
  portOption.required = true
  portOption.argParser(intParser)

  program
    .name('lt')
    .version(pkg.version)
    .description('localtunnel client')

    .addOption(portOption)
    .option('--host <string>', 'Upstream server providing forwarding', 'https://localtunnel.me')
    .option('--subdomain, -s <string>', 'Request this subdomain')

    .option('--local-host, -l <string>', 'Tunnel traffic to this host instead of localhost')
    .option('--local-hostname <string>', 'Rewrites the HTTP Host header going to the local server')

    .option('--local-https', 'Tunnel traffic to a local HTTPS server')
    .option('--local-key <path>', 'Path to certificate key file for local HTTPS server')
    .option('--local-cert <path>', 'Path to certificate PEM file for local HTTPS server')
    .option('--local-ca <path>', 'Path to certificate authority file for self-signed certificates')
    .option('--allow-invalid-cert', 'Disable certificate checks for your local HTTPS server (ignore cert/key/ca options)')

    .option('--secret <string>', 'Shared secret to enable JWT protected communication with the server')

    .option('--open, -o', 'Opens the tunnel URL in your browser')
    .option('--print-requests', 'Print basic request info')

    .action(runClient)

  program.parse();
}

main().catch(e => logger.error(e))

