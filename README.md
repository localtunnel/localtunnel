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


## USE ##

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
- The client should be able to **init** connections to 80 and any non-root TCP ports on the server.

#### On the server
After the installation, setup the server, it should be able to listen at 80, so you might need to start it as root.
```bash
# on server
sudo bin/server

# on client
bin/client --port 3000 --host http://dev.example.com
```
Now you will get a domain name such as `qdci.dev.example.com` to visit your local app listening at port 3000.

You could also config the server to listen at another port
```bash
# on server
bin/server --port 1324

# on client
bin/client --port 3000 --host http://dev.example.com
```
But the server is required to listen remote requests from port 80, you might need an reverse proxy setup. Check this [gist](https://gist.github.com/4351206) for a simple reverse proxy with nginx.

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
