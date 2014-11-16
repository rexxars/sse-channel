'use strict';

var Channel = require('../../');
var http = require('http');

module.exports = function(opts) {
    var channel = new Channel(opts);

    var server = http.createServer(function(req, res) {
        if (req.url.indexOf(opts.path) === 0) {
            // Serve the client using SSE-channel
            channel.addClient(req, res);
        }
    }).listen(opts.port || 6775, '127.0.0.1');

    return { server: server, channel: channel };
};