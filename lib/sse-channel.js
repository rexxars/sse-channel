'use strict';

var url = require('url');
var util = require('util');
var events = require('events');

// See initializeConnection() for an explanation
var preambleData = new Array(2057).join('-') + '\n';

/**
 * Server-Sent Events "Channel"
 *
 * The "channel"-concept is simply a collection of clients which should receive the same messages.
 * This is useful if you want to have one server which can easily handle different sources and
 * clients. History is automatically handled for you, as long as each event is accompanied by
 * a numeric ID. If a client reconnects with a `Last-Event-ID`-header, he receives all messages
 * newer than the given ID.
 *
 * @param {Object}  options               Options for this SSE-channel
 * @param {Array}   options.history       An array of messages to pre-populate the history with.
 *                                        Note: Number of items will equal the max history size,
 *                                        where the last elements in the array will be the present
 * @param {Number}  options.historySize   The maximum number of messages to keep in history
 * @param {Number}  options.retryTimeout  Milliseconds clients should wait before reconnecting
 * @param {Number}  options.pingInterval  How often the server should send a "ping" to clients
 * @param {Boolean} options.jsonEncode    Whether the client should auto-encode data as JSON before
 *                                        sending. Defaults to false.
 */
var SseChannel = function(options) {
    var opts = options || {};

    var jsonEncode = (
        typeof opts.jsonEncode === 'undefined' ?
            false :
            Boolean(opts.jsonEncode)
    );

    this.jsonEncode = jsonEncode;
    this.historySize = opts.historySize || 500;
    this.retryTimeout = opts.retryTimeout || null;
    this.pingInterval = (opts.pingInterval | 0) || 20000;

    // Populate history with the entries specified
    this.history = ((opts.history || [])
        .filter(hasId)
        .slice(0 - this.historySize)
        .reverse()
        .map(function(msg) {
            return {
                id: msg.id,
                msg: parseMessage(msg, jsonEncode)
            };
        })
    );

    this.connections = [];
    this.connectionCount = 0;

    // Start a timer that will ping all connected clients at a given interval
    this.timer = setInterval(this.ping.bind(this), this.pingInterval);
};

util.inherits(SseChannel, events.EventEmitter);

/**
 * Add a new client to the channel
 *
 * @param {Request}  req        Request of the client
 * @param {Response} res        Response of the client
 * @param {Function} [callback] Optional callback to run when the client has been added
 * @return {void}
 */
SseChannel.prototype.addClient = function(req, res, callback) {
    // amvtek's EventSource polyfill uses the query string to work around some limitations in
    // Internet Explorer. The last received event ID for instance will be a query parameter
    // instead of a header, and there's also a bug where IE will need 2kb of data before it
    // starts dispatching progress events: https://github.com/amvtek/EventSource/wiki/UserGuide
    var query = url.parse(req.url, true).query || {};

    // Initialize the connection
    initializeConnection({
        request: req,
        response: res,
        retry: this.retryTimeout,
        preamble: query.evs_preamble
    });

    // Add the connection to our pool
    this.connections.push(res);
    this.connectionCount = this.connections.length;

    // When the client disconnects, remove the client
    var removeClient = this.removeClient.bind(this, res);
    req.on('end', removeClient);
    req.on('close', removeClient);
    res.on('finish', removeClient);

    // The "last event id" is normally sent as a header,
    // but various polyfills apply it to the query string
    var lastEventId = (
        req.headers['last-event-id'] ||
        query.evs_last_event_id ||
        query.lastEventId ||
        0
    );

    // See if the client has requested some history entries
    if (lastEventId) {
        this.sendEventsSinceId(res, lastEventId);
    }

    this.emit('connect', this, req, res);

    if (callback) {
        process.nextTick(callback);
    }
};

/**
 * Remove the client from the channel
 *
 * @param {Response} res Response of the client
 */
SseChannel.prototype.removeClient = function(res) {
    var i = this.connections.indexOf(res)
    while (i !== -1) {
        this.connections.splice(i, 1)
        i = this.connections.indexOf(res)
    }

    this.connectionCount = this.connections.length;

    this.emit('disconnect', this, res);
};

/**
 * Get number of active connections on this channel
 *
 * @return {Number} Number of active connections
 */
SseChannel.prototype.getConnectionCount = function() {
    return this.connections.length;
};

/**
 * Send a "ping" (empty comment) to all clients, to keep the connections alive
 *
 */
SseChannel.prototype.ping = function() {
    broadcast(this.connections, ':\n');
};

/**
 * Tell the clients how long they should wait before reconnecting.
 * Note: This sends a message to all clients.
 *
 * @param {Number} retryTimeout Milliseconds clients should wait before reconnecting,
 *                              if they are disconnected.
 */
SseChannel.prototype.retry = function(retryTimeout) {
    this.retryTimeout = retryTimeout;
    broadcast(this.connections, 'retry: ' + retryTimeout + '\n');
};

/**
 * Send a message to all clients on the channel
 *
 * @param {Object|String} msg Message to send to the client
 * @param {String} msg.data   Data to send to the client (will be JSON-encoded if `jsonEncode` is enabled)
 * @param {Number} msg.id     ID of the event (used by clients when reconnecting to ensure all messages are received)
 * @param {String} msg.event  Event name (used on client side to trigger on specific event names)
 * @param {String} msg.retry  Retry timeout (same as `retry()`)
 * @param {Array}  [clients]  Optional array of Response objects - if specified, the message will
 *                            be sent only to these clients, as well as bypassing the history.
 */
SseChannel.prototype.send = function(msg, clients) {
    var message = parseMessage(msg, this.jsonEncode);

    if (!clients) {
        // Remove duplicate entries from the history
        if (msg.id) {
            this.history = this.history.filter(entry => entry.id !== msg.id)
        }

        // Add the message to history (if not a "private" message)
        var entry = { id: msg.id, msg: message };
        if (msg.id && this.history.unshift(entry) > this.historySize) {
            this.history.pop();
        }
    }

    broadcast(clients || this.connections, message);

    this.emit('message', this, msg, clients || this.connections);
};

/**
 * Send events since a given ID to the specified client
 *
 * @param  {Response} response Response object to use
 * @param  {Number}   sinceId  The event ID to use as a lower bound (non-inclusive)
 */
SseChannel.prototype.sendEventsSinceId = function(response, sinceId) {
    var entries = [];
    for (var i = 0; i < this.history.length; i++) {
        if (this.history[i].id <= sinceId) {
            break;
        }

        // Unshift so we send the oldest messages first
        entries.unshift(this.history[i].msg);
    }

    entries.map(function(msg) {
        response.write(msg);
    });

    flush(response);
};

/**
 * Close all connections on this channel and stop the ping timer
 *
 */
SseChannel.prototype.close = function() {
    clearInterval(this.timer);

    var i = this.connections.length;
    while (i--) {
        this.connections[i].end();
    }
};

/**
 * Sends the initial, required headers for the connection
 *
 * @param {Object}   opts           Options object
 * @param {Request}  opts.request   Request object to use
 * @param {Response} opts.response  Response object to use
 * @param {Number}   opts.retry     Time in milliseconds to specify as reconnection timeout
 * @param {Boolean}  opts.preamble  Whether to send a "preamble" of dummy data to the client
 */
function initializeConnection(opts) {
    opts.request.socket.setTimeout(0);
    opts.request.socket.setNoDelay(true);
    opts.request.socket.setKeepAlive(true);
    opts.response.writeHead(200, {
        'Content-Type': 'text/event-stream;charset=UTF-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    opts.response.write(':ok\n\n');

    // Only set retry if it has a sane value
    var retry = opts.retry | 0;
    if (retry) {
        opts.response.write('retry: ' + retry + '\n');
    }

    // Should we delivar a "preamble" to the client? Required in some cases by Internet Explorer,
    // see https://github.com/amvtek/EventSource/wiki/UserGuide for more information
    if (opts.preamble) {
        opts.response.write(':' + preambleData);
    }

    flush(opts.response);
}

/**
 * Broadcast a packet to all connected clients
 *
 * @param  {Array}  connections Array of connections (response instances) to write to
 * @param  {String} packet      The chunk of data to broadcast
 */
function broadcast(connections, packet) {
    var i = connections.length;
    while (i--) {
        connections[i].write(packet);
        flush(connections[i]);
    }
}

/**
 * Calls `flush()` on the response if it exists. This is necessary in the case
 * when you are using the `compression` middleware for express.js, where the
 * middleware will wait for a certain amount of data before sending it to the
 * client in order to compress in a more efficient manner.
 *
 * Unfortunately, node has a native (but deprecated) flush() method which will trigger
 * deprecation warnings if called. Thus, we're checking the name of the function.
 * Please open a pull request if you can come up with a cleaner approach to this.
 *
 * @param {Response} response Response object to flush
 */
function flush(response) {
    if (response.flush && response.flush.name !== 'deprecated') {
        response.flush();
    }
}

/**
 * Parse a message object (or string) into a writable data chunk
 *
 * @param  {String|Object} msg        Object or string to parse into sendable message
 * @param  {Boolean}       jsonEncode Whether to JSON-encode data parameter
 * @return {String}
 */
function parseMessage(msg, jsonEncode) {
    if (typeof msg === 'string') {
        msg = { data: msg };
    }

    var output = '';
    if (msg.event) {
        output += 'event: ' + msg.event + '\n';
    }

    if (msg.retry) {
        output += 'retry: ' + msg.retry + '\n';
    }

    if (msg.id) {
        output += 'id: ' + msg.id + '\n';
    }

    var data = msg.data || '';
    if (jsonEncode) {
        data = JSON.stringify(data);
    }

    output += parseTextData(data);

    return output;
}

/**
 * Parse text data, ensuring it doesn't break the SSE-protocol
 *
 * @param  {String} text
 * @return {String}
 */
function parseTextData(text) {
    var data = String(text).replace(/(\r\n|\r|\n)/g, '\n');
    var lines = data.split(/\n/), line;

    var output = '';
    for (var i = 0, l = lines.length; i < l; ++i) {
        line = lines[i];

        output += 'data: ' + line;
        output += (i + 1) === l ? '\n\n' : '\n';
    }

    return output;
}

/**
 * Returns whether a given item has an `id` property or not
 *
 * @param  {Object}  item
 * @return {Boolean}
 */
function hasId(item) {
    return item.id && item.id > 0;
}

module.exports = SseChannel;
