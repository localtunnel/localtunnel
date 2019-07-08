const Tunnel = require('./lib/Tunnel');

module.exports = function localtunnel(port, arg2, arg3) {
  const opt = typeof arg2 === 'function' ? {} : arg2;
  const fn = typeof arg2 === 'function' ? arg2 : arg3;
  opt.port = port;

  const client = new Tunnel(opt);

  client.open(err => {
    if (err) return fn(err);
    return fn(null, client);
  });

  return client;
};
