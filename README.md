# localtunnel-auth

localtunnel exposes your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

Great for working with browser testing tools like browserling or external api callback services like twilio which require a public url for callbacks.

__This fork supports authentification with HTTPS servers__

## Authentication

To setup your localtunnel server to handle authentication, we use nginx to check for passwords, before handing off the request to localtunnel.

Start by installing dependencies (nginx and apache2-utils):

```
apt install nginx apache2-utils
```

Follow the instructions on https://github.com/localtunnel/server:

```
git clone git://github.com/defunctzombie/localtunnel-server.git
cd localtunnel-server
npm install
```

To launch the server, use a command like:

```
node -r esm bin/server --port 1234 --domain <your domain name>
```

[Use apache-tools to make password](https://docs.nginx.com/nginx/admin-guide/security-controls/configuring-http-basic-authentication/)

```
htpasswd -c /etc/apache2/.htpasswd <account-name>
```

Setup nginx in /etc/nginx/sites-enabled/tunnel.nginx:

```
server {
  listen 80;
  server_name <my-domain-name>;

  location / {
    auth_basic "LocalTunnel";
    auth_basic_user_file /etc/apache2/.htpasswd;

    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:1234;
  }
}

server {
  listen 80;
  server_name *.<my-domain-name>;

  location / {
    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:1234;
  }
}
```

Setup a systemd service to start localtunnel automatically

/etc/systemd/system/localtunnel.service:

```
[Unit]
Description=LocalTunnel
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=5
ExecStart=/root/localtunnel-server/run

[Install]
WantedBy=multi-user.target
```

Start systemd service:

```
systemctl enable localtunnel
systemctl start localtunnel
```


## Quickstart

```
npx localtunnel --port 8000
```

## Installation

### Globally

```
npm install -g localtunnel-auth
```

### As a dependency in your project

```
yarn add localtunnel-auth
```

## CLI usage

When localtunnel is installed globally, just use the `lt` command to start the tunnel.

```
lt --port 8000 --local-host <localtunnel-server> --username <username> --password <password>
```

Thats it! It will connect to the tunnel server, setup the tunnel, and tell you what url to use for your testing. This url will remain active for the duration of your session; so feel free to share it with others for happy fun time!

You can restart your local server all you want, `lt` is smart enough to detect this and reconnect once it is back.

### Arguments

Below are some common arguments. See `lt --help` for additional arguments

- `--subdomain` request a named subdomain on the localtunnel server (default is random characters)
- `--local-host` proxy to a hostname other than localhost
- `--username` username for basic authentication
- `--password` password for basic authentication

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

Refer to [tls.createSecureContext](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options) for details on the certificate options.

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
