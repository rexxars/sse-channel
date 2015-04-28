sse-channel (Server-Sent Events channel)
========================================

[![Version npm](http://img.shields.io/npm/v/sse-channel.svg?style=flat-square)](http://browsenpm.org/package/sse-channel)[![Build Status](http://img.shields.io/travis/rexxars/sse-channel/master.svg?style=flat-square)](https://travis-ci.org/rexxars/sse-channel)[![Dependencies](https://img.shields.io/david/rexxars/sse-channel.svg?style=flat-square)](https://david-dm.org/rexxars/sse-channel)[![Coverage Status](http://img.shields.io/coveralls/rexxars/sse-channel/master.svg?style=flat-square)](https://coveralls.io/r/rexxars/sse-channel?branch=master)[![Code Climate](http://img.shields.io/codeclimate/github/rexxars/sse-channel.svg?style=flat-square)](https://codeclimate.com/github/rexxars/sse-channel/)

SSE-implementation which can connects to any http request/response stream.

# Features

  - Easily attach to any node.js http request
  - History is maintained automatically, max size is configurable
  - Optionally pre-populate history when creating the channel
  - Automatically sends missed events to clients when reconnecting
  - Attempts to keep clients alive by sending "pings" automatically
  - Easily send messages to all clients or to specific clients
  - Configurable reconnection timeout
  - Auto-encode packets as JSON (configurable)
  - Supports CORS
  - Supports a [number](https://github.com/amvtek/EventSource) of [different](https://github.com/Yaffle/EventSource/) [polyfills](https://github.com/remy/polyfills/blob/master/EventSource.js)
  - If polyfilled on the client side, works down to IE8 and Android 2.x
  - Maintains active connection count per channel

# Installing

```
npm install --save sse-channel
```

# Basic usage

```js
var SseChannel = require('sse-channel');
var http = require('http');
var os = require('os');

// Set up a new channel. Most of these options have sane defaults,
// feel free to look at lib/sse-channel.js for all available options
var sysInfoChannel = new SseChannel({
    retryTimeout: 250,
    historySize: 300,
    pingInterval: 15000,
    jsonEncode: true,
    cors: {
        origins: ['*'] // Defaults to []
    }
});

// Set up an HTTP server
http.createServer(function(req, res) {
    // The '/channel' prefix is not necessary - you can add any client
    // to an SSE-channel, if you want to.
    if (req.url.indexOf('/channel/sysinfo') === 0) {
        // Serve the client using sysinfo SSE-channel
        sysInfoChannel.addClient(req, res);
    } else {
        response.writeHead(404);
        response.end();
    }
}).listen(7788, '127.0.0.1', function() {
    console.log('Listening on http://127.0.0.1:7788/');
});

// Set up an interval that broadcasts system info every 250ms
var sysInfoCounter = 0;
setInterval(function broadcastSysInfo() {
    sysInfoChannel.send({
        id: sysInfoCounter++,
        data: {
            freemem: os.freemem(),
            loadavg: os.loadavg()
        }
    });
}, 250);

```

License
-------
MIT-licensed, see `LICENSE`
