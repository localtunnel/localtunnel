const Tunnel = require('./lib/Tunnel');

/**
 * Creates a new localtunnel to the specified local port.
 * 
 * @param {Object|number} arg1 - Port number or options object
 * @param {Object} [arg2] - Options object if arg1 is port number
 * @param {Function} [arg3] - Callback function if arg1 is port number and arg2 is options
 * @returns {Promise|Tunnel} - Promise that resolves to Tunnel instance, or Tunnel instance directly if callback provided
 * 
 * Available options:
 * - port: (number) [required] The local port number to expose through localtunnel
 * - subdomain: (string) Request a specific subdomain on the proxy server
 * - host: (string) URL for the upstream proxy server, defaults to https://localtunnel.me
 * - local_host: (string) Proxy to this hostname instead of localhost
 * - local_https: (boolean) Enable tunneling to local HTTPS server
 * - local_cert: (string) Path to certificate PEM file for local HTTPS server
 * - local_key: (string) Path to certificate key file for local HTTPS server
 * - local_ca: (string) Path to certificate authority file for self-signed certificates
 * - allow_invalid_cert: (boolean) Disable certificate checks for local HTTPS server
 * - maxReconnectAttempts: (number) Maximum number of reconnection attempts, defaults to 10
 * - reconnectBackoff: (number) Initial delay in ms between reconnection attempts, doubles with each attempt, defaults to 1000ms
 * - maxRequestLogSize: (number) Maximum number of requests to keep in log history, defaults to 100
 * 
 * The returned tunnel instance emits the following events:
 * - request: Fires when a request is processed, provides info about method, path and timestamp
 * - error: Fires when an error occurs
 * - close: Fires when the tunnel is closed
 * - connecting: Fires when the tunnel is attempting to connect
 * - connected: Fires when the tunnel is successfully connected
 * - reconnecting: Fires when the tunnel is attempting to reconnect
 * - reconnected: Fires when the tunnel has successfully reconnected
 * - reconnect_error: Fires when there's an error during reconnection
 * - status: Fires periodically with status information
 */
module.exports = function localtunnel(arg1, arg2, arg3) {
  const options = typeof arg1 === 'object' ? arg1 : { ...arg2, port: arg1 };
  const callback = typeof arg1 === 'object' ? arg2 : arg3;
  const client = new Tunnel(options);
  if (callback) {
    client.open(err => (err ? callback(err) : callback(null, client)));
    return client;
  }
  return new Promise((resolve, reject) =>
    client.open(err => (err ? reject(err) : resolve(client)))
  );
};
