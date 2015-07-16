# UNRELEASED

* keep sockets alive after connecting
* add --open param to CLI

# 1.5.0 (2014-10-25)

* capture all errors on remote socket and restart the tunnel

# 1.4.0 (2014-08-31)

* don't emit errors for ETIMEDOUT

# 1.2.0 / 2014-04-28

* return `client` from `localtunnel` API instantiation

# 1.1.0 / 2014-02-24

* add a host header transform to change the 'Host' header in requests

# 1.0.0 / 2014-02-14

* default to localltunnel.me for host
* remove exported `connect` method (just export one function that does the same thing)
* change localtunnel signature to (port, opt, fn)

# 0.2.2 / 2014-01-09
