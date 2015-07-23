/**
 * This file showcases how to set up SseChannel instances,
 * some common configuration parameters and how to broadcast data
 */
'use strict';

// Should be `require('sse-channel')` when outside of sse-channel repo
var SseChannel = require('../');
var dataProvider = require('./data-provider');

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

var sysInfoCounter = 0;
dataProvider.on('sysinfo', function(sysinfo) {
    // We could combine these two `send()` calls into one, but this example
    // showcases how usage of event names work when subscribing on the client
    sysInfoChannel.send({ id: ++sysInfoCounter, data: sysinfo.freeMem, event: 'freemem' });
    sysInfoChannel.send({ id: ++sysInfoCounter, data: sysinfo.loadAvg, event: 'loadavg' });
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

// Note that we're providing `send()` with an object here. Because we
// told the channel to JSON-serialize all our data, this works just fine,
// but we'll need to parse it on the client-side
dataProvider.on('random', function(randomData) {
    randomChannel.send({ data: randomData });
});

module.exports = {
    sysInfo: sysInfoChannel,
    random: randomChannel
};
