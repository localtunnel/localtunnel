# @chromaui/localtunnel

localtunnel exposes your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

Great for working with browser testing tools like browserling or external api callback services like twilio which require a public url for callbacks.

## Installation

```
yarn add @chromaui/localtunnel
```

## CLI usage

Assuming your local server is running on port 8000, just use the `lt` command to start the tunnel.

```
lt --port 8000
```

Thats it! It will connect to the tunnel server, setup the tunnel, and tell you what url to use for your testing. This url will remain active for the duration of your session; so feel free to share it with others for happy fun time!

You can restart your local server all you want, `lt` is smart enough to detect this and reconnect once it is back.

### Arguments

Below are some common arguments. See `lt --help` for additional arguments

- `--subdomain` request a named subdomain on the localtunnel server (default is random characters)
- `--local-host` proxy to a hostname other than localhost

You may also specify arguments via env variables. E.x.

```
PORT=3000 lt
```

## API

The localtunnel client is also usable through an API (for test integration, automation, etc)

### localtunnel({ port, ...options })

Creates a new localtunnel to the specified local `port`. Will return a Promise that resolves once you have been assigned a public localtunnel url. `options` can be used to request a specific `subdomain`.

```js
const localtunnel = require('@chromaui/localtunnel');

(async () => {
  const tunnel = await localtunnel({ port: 3000 });

  // the assigned public url for your tunnel
  // i.e. https://abcdefgjhij.localtunnel.me
  tunnel.url;

  tunnel.on('close', () => {
    // tunnels are closed
  });
})();
```

### options

- `port` [required] The local port number to expose through localtunnel.
- `subdomain` A _string_ value requesting a specific subdomain on the proxy server. **Note** You may not actually receive this name depending on availability.
- `local_host` Proxy to this hostname instead of `localhost`. This will also cause the `Host` header to be re-written to this value in proxied requests.

### Tunnel

The `tunnel` instance returned to your callback emits the following events

| event   | args | description                                                                          |
| ------- | ---- | ------------------------------------------------------------------------------------ |
| request | info | fires when a request is processed by the tunnel, contains _method_ and _path_ fields |
| error   | err  | fires when an error happens on the tunnel                                            |
| close   |      | fires when the tunnel has closed                                                     |

The `tunnel` instance has the following methods

| method | args | description      |
| ------ | ---- | ---------------- |
| close  |      | close the tunnel |

## other clients

Clients in other languages

_go_ [gotunnelme](https://github.com/NoahShen/gotunnelme)

_go_ [go-localtunnel](https://github.com/localtunnel/go-localtunnel)

## server

See [localtunnel/server](//github.com/localtunnel/server) for details on the server that powers localtunnel.

## License

MIT
