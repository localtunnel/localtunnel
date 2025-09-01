import Tunnel, { TunnelOptions } from './lib/Tunnel.js';


const localtunnel = async (options: TunnelOptions, open = true) => {
  const client = new Tunnel(options);
  if (open) await client.open()
  return client
};


export default localtunnel