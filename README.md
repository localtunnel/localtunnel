# localtunnel #

localtunnel exposes your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

Great for working with browser testing tools like browserling or external api callback services like twilio which require a public url for callbacks!

## installation ##

```
npm install -g localtunnel
```

## use ##

Super East! Assuming your local server is running on port 8000, just use the ```lt``` command to start the tunnel.

```
lt --port 8000
```

Thats it! It will connect to the tunnel server, setup the tunnel, and tell you what url to use for your testing. This url will remain active for the duration of your session; so feel free to share it with others for happy fun time!

You can restart your local server all you want, ```lt``` is smart enough to detect this and reconnect once it is back.
