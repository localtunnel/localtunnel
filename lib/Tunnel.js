/* eslint-disable consistent-return, no-underscore-dangle */

const { parse } = require('url');
const { EventEmitter } = require('events');
const axios = require('axios');
const debug = require('debug')('localtunnel:client');

const TunnelCluster = require('./TunnelCluster');

module.exports = class Tunnel extends EventEmitter {
  constructor(opts = {}) {
    super(opts);
    this.opts = opts;
    this.closed = false;
    this.status = 'initiated';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = opts.maxReconnectAttempts || 10;
    this.reconnectBackoff = opts.reconnectBackoff || 1000; // starting backoff in ms
    this.healthCheckInterval = null;
    this.lastActiveTime = Date.now();
    
    if (!this.opts.host) {
      this.opts.host = 'https://localtunnel.me';
    }
  }

  _getInfo(body) {
    /* eslint-disable camelcase */
    const { id, ip, port, url, cached_url, max_conn_count } = body;
    const { host, port: local_port, local_host } = this.opts;
    const { local_https, local_cert, local_key, local_ca, allow_invalid_cert } = this.opts;
    return {
      name: id,
      url,
      cached_url,
      max_conn: max_conn_count || 1,
      remote_host: parse(host).hostname,
      remote_ip: ip,
      remote_port: port,
      local_port,
      local_host,
      local_https,
      local_cert,
      local_key,
      local_ca,
      allow_invalid_cert,
    };
    /* eslint-enable camelcase */
  }

  _startHealthCheck() {
    // Clear any existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Check connection status every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      const idleTime = Date.now() - this.lastActiveTime;
      
      // If tunnel has been idle for more than 5 minutes, run a health check
      if (idleTime > 300000) { // 5 minutes in ms
        this._checkHealth();
      }
      
      // Emit status event with current state
      this.emit('status', {
        status: this.status,
        lastActive: this.lastActiveTime,
        idleTime,
        reconnectAttempts: this.reconnectAttempts,
        url: this.url
      });
    }, 30000);
  }
  
  _checkHealth() {
    debug('Performing health check on tunnel');
    
    // If we have a tunnelCluster, check if it's still functioning
    if (this.tunnelCluster) {
      // If tunnel is unhealthy, attempt to reconnect
      if (this.tunnelCluster.connectionCount === 0) {
        debug('Tunnel appears unhealthy, attempting to reconnect');
        this._reconnect();
      }
    }
  }
  
  _reconnect() {
    if (this.closed) {
      debug('Tunnel is closed, not attempting to reconnect');
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error('Maximum reconnection attempts reached'));
      this.status = 'failed';
      return;
    }
    
    this.status = 'reconnecting';
    this.reconnectAttempts += 1;
    
    // Use exponential backoff
    const delay = Math.min(30000, this.reconnectBackoff * Math.pow(2, this.reconnectAttempts - 1));
    
    debug(`Reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    
    setTimeout(() => {
      debug(`Executing reconnect attempt ${this.reconnectAttempts}`);
      
      // Re-initialize the tunnel
      this._init((err, info) => {
        if (err) {
          debug(`Reconnect failed: ${err.message}`);
          this.emit('reconnect_error', err);
          return this._reconnect(); // Try again
        }
        
        debug('Reconnect successful');
        this.clientId = info.name;
        this.url = info.url;
        
        if (info.cached_url) {
          this.cachedUrl = info.cached_url;
        }
        
        this.status = 'connected';
        this.reconnectAttempts = 0;
        this._establish(info);
        this.emit('reconnected', { url: this.url });
      });
    }, delay);
  }

  // initialize connection
  // callback with connection info
  _init(cb) {
    const opt = this.opts;
    const getInfo = this._getInfo.bind(this);

    const params = {
      responseType: 'json',
    };

    const baseUri = `${opt.host}/`;
    // no subdomain at first, maybe use requested domain
    const assignedDomain = opt.subdomain;
    // where to quest
    const uri = baseUri + (assignedDomain || '?new');

    this.status = 'connecting';
    this.emit('connecting');

    (function getUrl() {
      axios
        .get(uri, params)
        .then(res => {
          const body = res.data;
          debug('got tunnel information', res.data);
          if (res.status !== 200) {
            const err = new Error(
              (body && body.message) || 'localtunnel server returned an error, please try again'
            );
            return cb(err);
          }
          cb(null, getInfo(body));
        })
        .catch(err => {
          debug(`tunnel server offline: ${err.message}, retry 1s`);
          return setTimeout(getUrl, 1000);
        });
    })();
  }

  _establish(info) {
    // increase max event listeners so that localtunnel consumers don't get
    // warning messages as soon as they setup even one listener. See #71
    this.setMaxListeners(info.max_conn + (EventEmitter.defaultMaxListeners || 10));

    this.tunnelCluster = new TunnelCluster(info);

    // only emit the url the first time
    this.tunnelCluster.once('open', () => {
      this.emit('url', info.url);
      this.status = 'connected';
      this.emit('connected', { url: info.url });
    });

    // re-emit socket error
    this.tunnelCluster.on('error', err => {
      debug('got socket error', err.message);
      this.emit('error', err);
      
      // If there's a connection error, it might require reconnection
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        this._reconnect();
      }
    });

    let tunnelCount = 0;

    // track open count
    this.tunnelCluster.on('open', tunnel => {
      tunnelCount++;
      this.lastActiveTime = Date.now();
      debug('tunnel open [total: %d]', tunnelCount);

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
      debug('tunnel dead [total: %d]', tunnelCount);
      if (this.closed) {
        return;
      }
      this.tunnelCluster.open();
    });

    this.tunnelCluster.on('request', req => {
      this.lastActiveTime = Date.now();
      this.emit('request', req);
    });

    // establish as many tunnels as allowed
    for (let count = 0; count < info.max_conn; ++count) {
      this.tunnelCluster.open();
    }
    
    // Start health check monitoring
    this._startHealthCheck();
  }

  open(cb) {
    this._init((err, info) => {
      if (err) {
        this.status = 'error';
        return cb(err);
      }

      this.clientId = info.name;
      this.url = info.url;

      // `cached_url` is only returned by proxy servers that support resource caching.
      if (info.cached_url) {
        this.cachedUrl = info.cached_url;
      }

      this._establish(info);
      cb();
    });
  }

  close() {
    this.closed = true;
    this.status = 'closed';
    
    // Clear the health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.emit('close');
  }
  
  // Get the current status of the tunnel
  getStatus() {
    return {
      status: this.status,
      url: this.url,
      clientId: this.clientId,
      lastActive: this.lastActiveTime,
      reconnectAttempts: this.reconnectAttempts
    };
  }
};
