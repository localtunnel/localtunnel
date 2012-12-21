# localtunnel [![Build Status](https://secure.travis-ci.org/shtylman/localtunnel.png)](http://travis-ci.org/shtylman/localtunnel) #

localtunnel exposes your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

Great for working with browser testing tools like browserling or external api callback services like twilio which require a public url for callbacks. 

## installation ##

To use `lt` globally
```
npm install -g localtunnel
```

To use it locally:

```bash
git clone git://github.com/shtylman/localtunnel.git
cd localtunnel
npm install
bin/client --port 3000
```


## Usage ##

There are mainly two ways you could use localtunnel:
- use the service `localtunnel.me` (by default) together with the built-in client.
- setup both the server application and client application yourself.

### Client-Only Usage

Super Easy! Assuming your local server is running on port 8000, just use the `lt` command to start the tunnel.

```
lt --port 8000
```

Thats it! It will connect to the tunnel server, setup the tunnel, and tell you what url to use for your testing. This url will remain active for the duration of your session; so feel free to share it with others for happy fun time!

You can restart your local server all you want, `lt` is smart enough to detect this and reconnect once it is back.

### Server plus Client Usage
#### Requirements
- Install `localtunnel` on both ther server and the client to get it work.
- There is a domain and subdomain available to reach the server, such as `dev.example.com` and `*.dev.example.com`.
- The client should be able to **init** connections to any non-root TCP ports on the server. Setup your firewall accordingly.

#### On the server
After the installation, start the server to listen at a TCP port, and start the client to init connection to that port:
```bash
# on server
bin/server --port 1324

# on client
bin/client --port 3000 --host http://dev.example.com:1324
```
Now you will get a domain name such as `qdci.dev.example.com` to visit your local app listening at port 3000.

If you want to server listen on 80 port without starting it as root, you might need an reverse proxy setup. Check this [gist](https://gist.github.com/4351206) for a simple reverse proxy with nginx.

Now you could start the client to connection port 80 on the server.
```bash
# on server
bin/server --port 1324

# on client
bin/client --port 3000 --host http://dev.example.com
```

### API ###

The localtunnel client is also usable through an API (test integration, automation, etc)

```javascript
var lt_client = require('localtunnel').client;

var client = lt_client.connect({
    // the localtunnel server
    host: 'http://localtunnel.me',
    // your local application port
    port: 12345
});

// when your are assigned a url
client.on('url', function(url) {
    // you can now make http requests to the url
    // they will be proxied to your local server on port [12345]
});

client.on('error', function(err) {
    // uh oh!
});
```
