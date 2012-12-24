# localtunnel [![Build Status](https://secure.travis-ci.org/shtylman/localtunnel.png)](http://travis-ci.org/shtylman/localtunnel) #

localtunnel exposes your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

Great for working with browser testing tools like browserling or external api callback services like twilio which require a public url for callbacks.

## installation ##

```
npm install -g localtunnel
```

This will install the localtunnel module globally and add the 'lt' client cli tool to your PATH.

## use ##

Super Easy! Assuming your local server is running on port 8000, just use the ```lt``` command to start the tunnel.

```
lt --port 8000
```

Thats it! It will connect to the tunnel server, setup the tunnel, and tell you what url to use for your testing. This url will remain active for the duration of your session; so feel free to share it with others for happy fun time!

You can restart your local server all you want, ```lt``` is smart enough to detect this and reconnect once it is back.

### custom server

The default localtunnel client connects to the ```localtunnel.me``` server. You can however easily setup and run your own server. In order to run your own localtunnel server you must ensure that your server can meet the following requirements:

* You can setup DNS entries for your domain.tld and for *.domain.tld (or sub.domain.tld and *.sub.domain.tld)
* The server can accept incoming TCP connections for any non-root TCP port (ports over 1000).

The above are important as the client will ask the server for a subdomain under a particular domain. The server will listen on any OS assigned TCP port for client connections

#### setup

```shell
// pick a place where the files will live
git clone git://github.com/shtylman/localtunnel.git
cd localtunnel
npm install

// server set to run on port 1234
bin/server --port 1324
```

The localtunnel server is now running and waiting for client requests on port 1234. You will most likely want to setup a reverse proxy to listen on port 80 (or start localtunnel on port 80 directly).

#### use your server

You can now use your domain with the ```--host``` flag for the ```lt``` client.
```shell
lt --host http://sub.example.tld:1234 --port 9000
```

You will be assigned a url similar to ```qdci.sub.example.com:1234```

If your server is being a reverse proxy (i.e. nginx) and is able to listen on port 80, then you do not need the ```:1234``` part of the hostname for the ```lt``` client

## API ##

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
