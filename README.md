# localtunnel

localtunnel exposes your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

Great for working with browser testing tools like browserling or external api callback services like twilio which require a public url for callbacks.

## Quickstart

```
npx localtunnel --port 8000
```

## Installation

### Globally

```
npm install -g localtunnel
```

### As a dependency in your project

```
yarn add localtunnel
```

### Home brew

```bash
brew install lt
```

## CLI usage

When localtunnel is installed globally, just use the `lt` command to start the tunnel.

```
lt --port 8000
```

Thats it! It will connect to the tunnel server, setup the tunnel, and tell you what url to use for your testing. This url will remain active for the duration of your session; so feel free to share it with others for happy fun time!

You can restart your local server all you want, `lt` is smart enough to detect this and reconnect once it is back.

### Arguments

Below are some common arguments. See `lt --help` for additional arguments

- `--subdomain` request a named subdomain on the localtunnel server (default is random characters)
- `--local-host` proxy to a hostname other than localhost
- `--max-reconnect` maximum number of reconnection attempts (default is 10)
- `--reconnect-backoff` initial delay in ms between reconnection attempts (doubles with each attempt, default is 1000ms)
- `--detailed-logs` enable detailed request logging with timestamps and headers
- `--status-monitor` display periodic connection status updates
- `--request-log-size` maximum number of requests to keep in memory (default is 100)

You may also specify arguments via env variables. E.x.

```
PORT=3000 lt
```

## API

The localtunnel client is also usable through an API (for test integration, automation, etc)

### localtunnel(port [,options][,callback])

Creates a new localtunnel to the specified local `port`. Will return a Promise that resolves once you have been assigned a public localtunnel url. `options` can be used to request a specific `subdomain`. A `callback` function can be passed, in which case it won't return a Promise. This exists for backwards compatibility with the old Node-style callback API. You may also pass a single options object with `port` as a property.

```js
const localtunnel = require('localtunnel');

(async () => {
  const tunnel = await localtunnel({ port: 3000 });

  // the assigned public url for your tunnel
  // i.e. https://abcdefgjhij.localtunnel.me
  tunnel.url;

  // the current status of the tunnel
  const status = tunnel.getStatus();
  console.log(status.status); // 'connected'

  tunnel.on('status', (status) => {
    // status updates emitted periodically
    console.log(`Status: ${status.status}, Last activity: ${status.lastActive}`);
  });

  tunnel.on('request', (info) => {
    // requests going through the tunnel
    console.log(`${info.method} ${info.path}`);
  });

  tunnel.on('close', () => {
    // tunnels are closed
  });
})();
```

#### options

- `port` (number) [required] The local port number to expose through localtunnel.
- `subdomain` (string) Request a specific subdomain on the proxy server. **Note** You may not actually receive this name depending on availability.
- `host` (string) URL for the upstream proxy server. Defaults to `https://localtunnel.me`.
- `local_host` (string) Proxy to this hostname instead of `localhost`. This will also cause the `Host` header to be re-written to this value in proxied requests.
- `local_https` (boolean) Enable tunneling to local HTTPS server.
- `local_cert` (string) Path to certificate PEM file for local HTTPS server.
- `local_key` (string) Path to certificate key file for local HTTPS server.
- `local_ca` (string) Path to certificate authority file for self-signed certificates.
- `allow_invalid_cert` (boolean) Disable certificate checks for your local HTTPS server (ignore cert/key/ca options).
- `maxReconnectAttempts` (number) Maximum number of reconnection attempts (default: 10).
- `reconnectBackoff` (number) Initial delay in ms between reconnection attempts - doubles with each attempt (default: 1000ms).
- `maxRequestLogSize` (number) Maximum number of requests to keep in log history (default: 100).

Refer to [tls.createSecureContext](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options) for details on the certificate options.

### Tunnel

The `tunnel` instance returned to your callback emits the following events

| event           | args | description                                                                          |
| --------------- | ---- | ------------------------------------------------------------------------------------ |
| request         | info | fires when a request is processed by the tunnel, contains _method_, _path_, _id_ and _timestamp_ fields |
| error           | err  | fires when an error happens on the tunnel                                            |
| close           |      | fires when the tunnel has closed                                                     |
| connecting      |      | fires when the tunnel is attempting to connect                                       |
| connected       | info | fires when the tunnel is successfully connected, contains _url_ field               |
| reconnecting    | info | fires when tunnel is attempting to reconnect, contains _attempt_ and _delay_ fields |
| reconnected     | info | fires when tunnel has successfully reconnected, contains _url_ field                |
| reconnect_error | err  | fires when there's an error during reconnection                                     |
| status          | info | fires periodically with status information                                           |

The `tunnel` instance has the following methods

| method    | args | description                                                                |
| --------- | ---- | -------------------------------------------------------------------------- |
| close     |      | close the tunnel                                                           |
| getStatus |      | get the current status of the tunnel including connection state and stats  |

## other clients

Clients in other languages

_go_ [gotunnelme](https://github.com/NoahShen/gotunnelme)

_go_ [go-localtunnel](https://github.com/localtunnel/go-localtunnel)

_C#/.NET_ [localtunnel-client](https://github.com/angelobreuer/localtunnel.net)

_Rust_ [rlt](https://github.com/kaichaosun/rlt)

## server

See [localtunnel/server](//github.com/localtunnel/server) for details on the server that powers localtunnel.

## License

MIT
