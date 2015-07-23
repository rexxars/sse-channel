/**
 * See `examples/channels.js` for how to set up SseChannel instances
 */
'use strict';

var path = require('path');
var http = require('http');
var stc = require('node-static');
var channels = require('../channels');
var port = process.argv[2] || 7553;
var file = new stc.Server(path.join(__dirname, '..', 'client'));

// Set up an HTTP server
http.createServer(function(req, res) {
    // The '/channel' prefix is not necessary - you can add any client
    // to an SSE-channel, if you want to, regardless of URL
    if (req.url.indexOf('/channel/sysInfo') === 0) {
        // Serve the client using the "sysinfo" SSE-channel
        channels.sysInfo.addClient(req, res);
    } else if (req.url.indexOf('/channel/random') === 0) {
        // Serve the client using the "random" SSE-channel
        channels.random.addClient(req, res);
    } else {
        // Serve static files
        req.addListener('end', function() {
            file.serve(req, res);
        }).resume();
    }
}).listen(port, '127.0.0.1', function() {
    console.log('Listening on http://127.0.0.1:' + port + '/');
});
