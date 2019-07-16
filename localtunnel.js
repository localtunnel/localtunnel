const Tunnel = require('./lib/Tunnel');

module.exports = function localtunnel(options) {
  const client = new Tunnel(options);
  return new Promise((resolve, reject) => client.open(err => err ? reject(err) : resolve(client)))
};
