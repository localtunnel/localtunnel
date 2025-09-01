import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { EventEmitter } from 'events';

import jwt from 'jsonwebtoken';
import TunnelCluster from './TunnelCluster.js';
import { newLogger } from './logger.js';
import { sleep } from './utils.js';

const TOKEN_EXPIRES = 60 * 60 // from now, in seconds

export type TunnelOptions = {
  
  host?: string
  port?: number

  subdomain?: string

  local_host?: string
  local_hostname?: string

  local_https?: string, 
  local_cert?: string, 
  local_key?: string, 
  local_ca?: string, 
  allow_invalid_cert?: boolean

  secret?: string
}

type TunnelInfo = {
  name: string
  url: string
  cached_url?: string
  max_conn: number
  remote_host: string
  remote_port: number
  local_port?: number
  local_host?: string
  local_https?: string
  local_cert?: string
  local_key?: string
  local_ca?: string
  allow_invalid_cert?: boolean
}

type LTServerResponse = {
  id: string,
  port: number,
  max_conn_count: number,
  url: string
  message?: string
  cached_url?: string
}

export default class Tunnel extends EventEmitter {

  private readonly logger = newLogger(Tunnel.name)

  private closed: boolean
  private tunnelCluster: TunnelCluster
  
  private clientId: string
  private url: string
  private cachedUrl: string

  private token?: string

  constructor(private readonly opts: TunnelOptions = {}) {
    super();
    this.closed = false;
    if (!this.opts.host) {
      this.opts.host = 'https://localtunnel.me';
    }
  }

  isClosed() {
    return this.closed
  }

  getURL() {
    return this.url
  }

  getCachedURL() {
    return this.cachedUrl
  }

  getClientId() {
    return this.clientId
  }

  private getInfo(body: LTServerResponse) : TunnelInfo {
     
    const { id, port, url, max_conn_count, cached_url } = body;
    const { host, port: local_port, local_host } = this.opts;
    const { local_https, local_cert, local_key, local_ca, allow_invalid_cert } = this.opts;
    return {
      name: id,
      url,
      cached_url,
      max_conn: max_conn_count || 1,
      remote_host: new URL(host).hostname,
      remote_port: port,
      local_port,
      local_host,
      local_https,
      local_cert,
      local_key,
      local_ca,
      allow_invalid_cert,
    };
     
  }

  private getToken(secret?: string, data: Record<string, string> = {}) {
    if (this.token) return this.token
    
    this.token = jwt.sign({ 
      ...data,
      exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRES,
    }, secret);

    // reset token and force to regenerate
    setTimeout(() => {
      this.token = undefined
    }, (TOKEN_EXPIRES - 10) * 1000)

    return this.token
  }

  // initialize connection
  // callback with connection info
  private async init() {

    const opts = this.opts;

    const params: AxiosRequestConfig = {
      responseType: 'json',
    };

    const baseUri = `${opts.host}/`;
    // no subdomain at first, maybe use requested domain
    const assignedDomain = opts.subdomain;
    // where to quest
    const uri = baseUri + (assignedDomain || '?new');

    const waitFor = 1000
    const maxRetries = 10
    let retries = 0
    const retry = true
    while(retry) {
      try {

        if (opts.secret) {
          params.headers = {
            Authorization: `Bearer ${this.getToken(opts.secret, { name: opts.subdomain || 'lt' })}`
          }
        }

        const res = await axios.get<unknown, AxiosResponse<LTServerResponse>>(uri, params)

        const body = res.data;

        this.logger.debug(`got tunnel information ${JSON.stringify(res.data)}`);

        if (res.status !== 200) {
          const err = new Error(
            (body && body.message) || 'localtunnel server returned an error, please try again'
          );
          throw err
        }

        return this.getInfo(body)
      }  catch (err) {

        if(err.response?.status === 401){
          this.logger.warn(`Server requires a secret to connect (${err.response.status} ${err.response.statusText})`)
          return null
        }

        retries++

        if (retries >= maxRetries) {
          // fail after threshold
          this.emit('error', new Error(`tunnel server unreachable after ${retries} retries.`))
          break
        }

        const waitTime = waitFor * (retries * 1.5)
        this.logger.debug(`tunnel server ${uri} offline: ${err.message}, retry in ${Math.floor(waitTime/1000)}sec (${retries}/${maxRetries})`);
        await sleep(waitTime)
      }
    }

    return null
  }

  private establish(info: TunnelInfo) {
    // increase max event listeners so that localtunnel consumers don't get
    // warning messages as soon as they setup even one listener. See #71
    this.setMaxListeners(info.max_conn + (EventEmitter.defaultMaxListeners || 10));

    this.tunnelCluster = new TunnelCluster(info);

    // only emit the url the first time
    this.tunnelCluster.once('open', () => {
      this.emit('url', info.url);
    });

    // re-emit socket error
    this.tunnelCluster.on('error', err => {
      this.logger.debug(`got socket error ${err.message}`);
      this.emit('error', err);
    });

    let tunnelCount = 0;

    // track open count
    this.tunnelCluster.on('open', tunnel => {
      tunnelCount++;
      this.logger.debug(`tunnel open [total: ${tunnelCount}]`);

      const closeHandler = () => {
        tunnel.destroy();
      };

      if (this.closed) {
        return closeHandler();
      }

      this.once('close', closeHandler);
      tunnel.once('close', () => {
        this.removeListener('close', closeHandler);
      });
    });

    // when a tunnel dies, open a new one
    this.tunnelCluster.on('dead', () => {
      tunnelCount--;
      this.logger.debug(`tunnel dead [total: ${tunnelCount}]`);
      if (this.closed) {
        return;
      }
      this.tunnelCluster.open();
    });

    this.tunnelCluster.on('request', req => {
      this.emit('request', req);
    });

    // establish as many tunnels as allowed
    for (let count = 0; count < info.max_conn; ++count) {
      this.tunnelCluster.open();
    }
  }

  async open() {
    const info = await this.init()

    if (!info) {
      this.closed = true
      return
    }

    this.clientId = info.name;
    this.url = info.url;

    // `cached_url` is only returned by proxy servers that support resource caching.
    if (info.cached_url) {
      this.cachedUrl = info.cached_url;
    }

    await this.establish(info);

    this.closed = false
  }

  async close() {
    this.closed = true;
    await this.tunnelCluster?.close()
    this.emit('close');
  }
};
