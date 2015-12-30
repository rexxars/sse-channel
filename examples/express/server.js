/**
 * See `examples/channels.js` for how to set up SseChannel instances
 * You need to run `npm install express compression` in order for this example to work
 */
'use strict';

var path = require('path');
var express = require('express');
var compression = require('compression');
var channels = require('../channels');
var port = process.argv[2] || 7553;
var app = express();

// Note: Compression is optional and might not be the best idea for Server-Sent Events,
// but this showcases that SseChannel attempts to flush responses as quickly as possible,
// even with compression enabled
app.use(compression());

// Serve static files for the demo
app.use(express.static(path.join(__dirname, '..', 'client')));

// The '/channel' prefix is not necessary - you can add any client
// to an SSE-channel, if you want to, regardless of URL
app.get('/channel/sysInfo', function(req, res) {
    // Serve the client using the "sysinfo" SSE-channel
    channels.sysInfo.addClient(req, res);
});

app.get('/channel/random', function(req, res) {
    // Serve the client using the "random" SSE-channel
    channels.random.addClient(req, res);
});

app.listen(port, function() {
    console.log('Listening on http://localhost:%s/', port);
});
