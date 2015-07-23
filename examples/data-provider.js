/**
 * This is a simple data provider implemented as an EventEmitter,
 * to prevent duplicating some data fetching logic in every example
 */
'use strict';

var os = require('os');
var events = require('events');
var EventEmitter = events.EventEmitter;

var emitter = new EventEmitter();

setInterval(function broadcastSysInfo() {
    emitter.emit('sysinfo', {
        freeMem: os.freemem(),
        loadAvg: os.loadavg()[0]
    });
}, 250);

setInterval(function broadcastRandomNumber() {
    emitter.emit('random', {
        time: (new Date()).toISOString(),
        randomNumber: Math.random()
    });
}, 1000);

module.exports = emitter;
