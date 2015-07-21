'use strict';

var Channel = require('../../');
var http = require('http');

module.exports = function(opts) {
    var channel = new Channel(opts);

    var server = http.createServer(function(req, res) {
        if (opts.flush) {
            res.flush = opts.flush;
        }

        channel.addClient(req, res, opts.addClientCallback);
    }).listen(opts.port || 6775, '127.0.0.1');

    return { server: server, channel: channel };
};
