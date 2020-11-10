sse-channel (Server-Sent Events channel)
========================================

[![Version npm](http://img.shields.io/npm/v/sse-channel.svg?style=flat-square)](http://browsenpm.org/package/sse-channel)[![Build Status](http://img.shields.io/travis/rexxars/sse-channel/main.svg?style=flat-square)](https://travis-ci.org/rexxars/sse-channel)[![Coverage Status](http://img.shields.io/coveralls/rexxars/sse-channel/main.svg?style=flat-square)](https://coveralls.io/r/rexxars/sse-channel?branch=main)[![Code Climate](http://img.shields.io/codeclimate/github/rexxars/sse-channel.svg?style=flat-square)](https://codeclimate.com/github/rexxars/sse-channel/)

SSE-implementation which can be used to any node.js http request/response stream.

# Features

  - Easily attach to any node.js http request ([express](examples/express/server.js), [hapi](examples/hapi/server.js), [node http](examples/node.js/server.js))
  - History is maintained automatically, max size is configurable
  - Optionally pre-populate history when creating the channel
  - Automatically sends missed events to clients when reconnecting
  - Attempts to keep clients alive by sending "pings" automatically
  - Easily send messages to all clients or to specific clients
  - Configurable reconnection timeout
  - Auto-encode packets as JSON (configurable)
  - Supports a [number](https://github.com/amvtek/EventSource) of [different](https://github.com/Yaffle/EventSource/) [polyfills](https://github.com/remy/polyfills/blob/master/EventSource.js)
  - Works with the [compression](https://github.com/expressjs/compression) middleware
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

// Set up an interval that broadcasts server date every second
var dateChannel = new SseChannel();
setInterval(function broadcastDate() {
    dateChannel.send((new Date()).toISOString());
}, 1000);

// Create a regular HTTP server (works with express, too)
http.createServer(function(req, res) {
    // Note that you can add any client to an SSE channel, regardless of path.
    // Only requirement is not having written data to the response stream yet
    if (req.url.indexOf('/channel/date') === 0) {
        dateChannel.addClient(req, res);
    } else {
        res.writeHead(404);
        res.end();
    }
}).listen(7788, '127.0.0.1', function() {
    console.log('Listening on http://127.0.0.1:7788/');
});
```

See [examples](examples/) for express/hapi/node server examples.

# Options

The following are available as options to the `SseChannel` constructor.

- `historySize` - The maximum number of messages to keep in history. Note: Only messages with an `id` property are saved to history. Default: `500`
- `history` - Array of messages to pre-populate the history with. Note: If the size of the array specified exceeds the specified `historySize`, the array will be sliced to contain only the last `X` elements. Default: `[]`
- `retryTimeout` - How many milliseconds clients should wait before attempting to reconnect, if disconnected. Default: `undefined` - browser default.
- `pingInterval` - How often the server should send a "ping" to clients in order to keep the connection alive (milliseconds). Default: `20000` (20s)
- `jsonEncode` - Whether the client should auto-encode messages as JSON before sending. Default: `false`.

# Methods

All instances of `SseChannel` have the following methods:

### channel.addClient(request, response, [callback])

Add a client to the channel. `request` is the `http.IncomingMessage` instance for the connection, while `response` is the `http.ServerResponse` instance to write data to.

If specified, the `callback` supplied will be called once the client has been added.

### channel.removeClient(response)

Removes a client (`response`) from a channel. Note that this does not actually close the connection - for that, use `response.end()`. Also worth mentioning is that most clients will see this as an unintentional disconnect and will thus attempt to reconnect. Developers are encouraged to implement some sort of `disconnect` event that can be sent prior to disconnecting clients.

### channel.getConnectionCount()

Get the number of active connections currently connected to the channel.

### channel.ping()

Manually broadcast a "ping" to all connected clients, to keep the connections alive. Note that this is handled automatically by specifying the `pingInterval` option when instantiating the channel.

### channel.retry(duration)

Tell clients how many milliseconds (`duration`) they should wait before attempting to reconnect, if disconnected.

### channel.send(msg, [clients])

Send a message to all (or a subset of) connected clients.

`msg` can either be a string or an object. Specifying just a string will send the message without any `id` or `event` name, and will not end up in the history for the channel. The alternative is to provide an object:
 - `msg.data` - Data to send to the client. Data will be JSON-encoded if `jsonEncode` is enabled for the channel, otherwise it is sent as-is.
 - `msg.id` - ID of the event. Used by clients when reconnecting to ensure all messages are received. You are required to specify this if you want the message to be added to the channel history and have clients request missed data on reconnects.
 - `msg.event` - Event name, used on the client side to trigger on specific events.
 - `msg.retry` - Retry timeout (same as `retry()`)

### channel.sendEventsSinceId(response, sinceId)

Send events since a given ID from the channel history to the specified client. Usually handled automatically on reconnect, but could be useful for more customized implementations.

### channel.close()

Close all connections on this channel and stop sending "keep alive"-pings. Note that this will usually only trigger all clients to reconnect, which is probably not what you want. You might want to implement some sort of `disconnect`-contract between the server and client, before you call this.

# Events

`SseChannel` implements the EventEmitter contract, and emits the following events:

* `connect` - When a client has successfully connected and the initial headers have been queued for writing. Listeners are provided with the following arguments: `channel`, `request`, `response`
* `disconnect` - When a client closes the connection for any reason. Listeners are provided with the following arguments: `channel`, `response`
* `message` - When a message has been queued for sending. Listeners are provided with the following arguments: `channel`, `msg`, `clients`. In this case, `clients` is an array of either the clients provided or the full array of clients.

# Client usage

In browsers, use `EventSource` as you normally would. For browsers that don't natively support `EventSource`, I recommend amvtek's [polyfill](https://github.com/amvtek/EventSource). Basic client usage:

```js
var es = new EventSource('http://localhost:1337/channels/soccer-goals');
es.addEventListener('goal', function(e) {
    alert('GOAL! ' + e.data);
});

// On the server:
soccerGoalChannel.send({
    event: 'goal',
    data: 'Manchester Utd - Swansea (2-1: Wayne Rooney)'
})
```

Note that the above is the usage when using named events. The default (and most basic) way is:

```js
var es = new EventSource('http://localhost:1337/channels/ticker');
es.onmessage = function(e) {
    alert(e.data);
};

// On the server:
tickerChannel.send({ data: 'Some message here' });
```

Also note that when using `jsonEncode` option of SSE-Channel, you'll have to decode the message on the client:

```js
var es = new EventSource('http://localhost:1337/channels/sysinfo');
es.onmessage = function(e) {
    var data = JSON.parse(e.data);
    console.log('CPU usage: ' + e.cpuUsage);
};

// On the server:
var sysInfoChannel = new SseChannel({ jsonEncode: true });
sysInfoChannel.send({
    data: { cpuUsage: 13.37 }
});
```

# Advanced example

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
});

// Set up an HTTP server
http.createServer(function(req, res) {
    // The '/channel' prefix is not necessary - you can add any client
    // to an SSE-channel, if you want to.
    if (req.url.indexOf('/channel/sysinfo') === 0) {
        // Serve the client using sysinfo SSE-channel
        sysInfoChannel.addClient(req, res);
    } else {
        res.writeHead(404);
        res.end();
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
