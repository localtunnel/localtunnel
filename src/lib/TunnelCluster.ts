import { EventEmitter } from 'events';
import fs from 'fs/promises';
import net from 'net';
import tls from 'tls';

import Stream from 'stream';
import HeaderHostTransformer from './HeaderHostTransformer.js';
import { newLogger } from './logger.js';

type SocketError = Error & { code: string }

type TunnelClusterOptions = {
  
  remote_host?: string
  remote_ip?: string
  remote_port?: number
  
  local_host?: string
  local_hostname?: string
  local_port?: number
  local_https?: string

  allow_invalid_cert?: boolean
  local_cert?: string
  local_key?: string
  local_ca?: string
}

type LocalCertOpts = {
  rejectUnauthorized?: boolean
  cert?: Buffer
  key?: Buffer
  ca?: Buffer[]
}

// manages groups of tunnels
export default class TunnelCluster extends EventEmitter {

  private readonly logger = newLogger(TunnelCluster.name)

  private certOpts: LocalCertOpts = {}

  private readonly remotes: net.Socket[] = []

  constructor(private readonly opts: TunnelClusterOptions = {}) {
    super();
    this.setMaxListeners(15)
  }

  emit(eventName: 'dead') : boolean
  emit(eventName: 'error', err: Error) : boolean
  emit(eventName: 'open', socket: net.Socket) : boolean
  emit(eventName: 'request', req: { method: string, path: string }) : boolean
  emit(eventName: string, ...args: unknown[]) {
    return super.emit(eventName, ...args)
  }

  async close() {
    for (const remote of this.remotes) {
      if (!remote.closed && !remote.destroyed) {
        try {
          await new Promise<void>((resolve) => remote.end(() => resolve()))
        } catch {
          //
        }
      }
      this.removeRemote(remote)
    }
  }

  private removeRemote(remote: net.Socket) {
    const pos = this.remotes.indexOf(remote)
    if (pos > -1) {
      this.remotes.splice(pos, 1)
    }
  }

  async getLocalCertOpts () {
    if (!this.certOpts) {
      this.certOpts = this.opts.allow_invalid_cert
        ? { rejectUnauthorized: false }
        : {
          cert: await fs.readFile(this.opts.local_cert),
          key: await fs.readFile(this.opts.local_key),
          ca: this.opts.local_ca ? [await fs.readFile(this.opts.local_ca)] : undefined,
        };
    }
    return this.certOpts
  }


  open() {
    const opt = this.opts;

    // Prefer IP if returned by the server
    const remoteHostOrIp = opt.remote_ip || opt.remote_host;
    const remotePort = opt.remote_port;
    const localHost = opt.local_host || 'localhost';
    const localHostname = opt.local_hostname || opt.local_host
    const localPort = opt.local_port;
    const localProtocol = opt.local_https ? 'https' : 'http';
    const allowInvalidCert = opt.allow_invalid_cert;

    this.logger.debug(
      `establishing tunnel ${localProtocol}://${localHost}:${localPort} <> ${remoteHostOrIp}:${remotePort}`
    );

    // connection to localtunnel server
    const remote = net.connect(+remotePort, remoteHostOrIp, () => {});

    remote.setKeepAlive(true);

    remote.on('error', (err: SocketError) => {
      this.logger.debug(`got remote connection error ${err.message}`);

      // emit connection refused errors immediately, because they
      // indicate that the tunnel can't be established.
      if (err.code === 'ECONNREFUSED') {
        this.emit(
          'error',
          new Error(
            `connection refused: ${remoteHostOrIp}:${remotePort} (check your firewall settings)`
          )
        );
      }

      remote.end();
    });

    const connLocal = async () => {
      if (remote.destroyed) {
        this.logger.debug('remote destroyed');
        this.emit('dead');
        return;
      }

      this.logger.debug(`connecting locally to ${localProtocol}://${localHost}:${localPort}`);
      remote.pause();

      if (allowInvalidCert) {
        this.logger.debug('allowing invalid certificates');
      }

      // connection to local http server
      const localCertOpts = await this.getLocalCertOpts()
      const local = opt.local_https
        ? tls.connect({ host: localHost, port: localPort, ...localCertOpts })
        : net.connect({ host: localHost, port: localPort });

      const remoteClose = () => {
        this.logger.debug('remote close');
        this.emit('dead');
        this.removeRemote(remote)
        local.end();
      };

      remote.once('close', remoteClose);

      // TODO some languages have single threaded servers which makes opening up
      // multiple local connections impossible. We need a smarter way to scale
      // and adjust for such instances to avoid beating on the door of the server
      local.once('error', (err: SocketError) => {
        this.logger.debug(`local error ${err.message}`);
        local.end();

        remote.removeListener('close', remoteClose);

        if (err.code !== 'ECONNREFUSED'
            && err.code !== 'ECONNRESET') {
          remote.end();
          return 
        }

        // retrying connection to local server
        setTimeout(connLocal, 1000);
      });

      local.once('connect', () => {
        this.logger.debug('connected locally');
        remote.resume();

        let stream: Stream = remote;

        // if user requested specific local host
        // then we use host header transform to replace the host header
        if (localHostname) {
          this.logger.debug(`transform Host header to ${localHostname}`);
          stream = remote.pipe(new HeaderHostTransformer({ host: localHostname }));
        }

        stream.pipe(local).pipe(remote);

        // when local closes, also get a new remote
        local.once('close', hadError => {
          this.logger.debug(`local connection closed [${hadError}]`);
        });
      });
    };

    remote.on('data', data => {
      const match = data.toString().match(/^(\w+) (\S+)/);
      if (match) {
        this.emit('request', {
          method: match[1],
          path: match[2],
        });
      }
    });

    // tunnel is considered open when remote connects
    remote.once('connect', () => {      
      this.emit('open', remote);
      connLocal();
    });

    this.remotes.push(remote)

  }

};
