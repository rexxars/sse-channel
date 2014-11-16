'use strict';

var SseChannel = require('../');
var stc  = require('node-static');
var http = require('http');
var os = require('os');
var port = process.argv[2] || 7553;
var file = new stc.Server(__dirname + '/public');

/**
 * This channel will provide system information (load average + free memory)
 * to connected clients once per second. We'll set it to have a history size
 * of 300. Clients should attempt to reconnect after 250ms, if disconnected.
 *
 * @type {SseChannel}
 */
var sysInfoChannel = new SseChannel({
    retryTimeout: 250,
    historySize: 300
});

/**
 * This channel will just provide random numbers.
 * We'll configure it to only have a history size of 5 entries,
 * and allow connections from all origins. We'll also set the
 * ping interval to be higher than normal (60 seconds).
 *
 * @type {SseChannel}
 */
var randomChannel = new SseChannel({
    historySize: 5,
    cors: { origins: ['*'] },
    pingInterval: 60 * 1000,
    jsonEncode: true
});

/**
 * We can start broadcasting messages even if no clients are connected.
 */
var sysInfoCounter = 0;
setInterval(function broadcastSysInfo() {
    // We could combine these two `send()` calls into one, this example
    // showcases how usage of event names work when subscribing on the client
    sysInfoChannel.send({ id: ++sysInfoCounter, data: os.freemem(), event: 'freemem' });
    sysInfoChannel.send({ id: ++sysInfoCounter, data: os.loadavg()[0], event: 'loadavg' });
}, 250);

setInterval(function broadcastRandomNumber() {
    // Note that we're providing `send()` with an object here. Because we
    // told the channel to JSON-serialize all our data, this works just fine,
    // but we'll need to parse it on the client-side
    var info = {
        time: (new Date()).toISOString(),
        randomNumber: Math.random()
    };

    randomChannel.send({ data: info });
}, 1000);

// Set up an HTTP server
http.createServer(function(req, res) {
    // The '/channel' prefix is not necessary - you can add any client
    // to an SSE-channel, if you want to.
    if (req.url.indexOf('/channel/sysinfo') === 0) {
        // Serve the client using sysinfo SSE-channel
        sysInfoChannel.addClient(req, res);
    } else if (req.url.indexOf('/channel/random') === 0) {
        // Serve the client using random SSE-channel
        randomChannel.addClient(req, res);
    } else {
        // Serve static files
        req.addListener('end', function() {
            file.serve(req, res);
        }).resume();
    }
}).listen(port, '127.0.0.1', function() {
    console.log('Listening on http://127.0.0.1:' + port + '/');
});
