/**
 * See `examples/channels.js` for how to set up SseChannel instances
 * You need to run `npm install hapi` for this example to work
 */
'use strict';

var path = require('path');
var Hapi = require('hapi');
var channels = require('../channels');
var port = process.argv[2] || 7553;
var server = new Hapi.Server();
server.connection({ port: port });

// The '/channel' prefix is not necessary - you can add any client
// to an SSE-channel, if you want to, regardless of URL
server.route({
    method: 'GET',
    path: '/channel/{channel}',
    handler: function(request, reply) {
        var chan = request.params.channel;
        if (!channels[chan]) {
            return reply('Channel not found').code(404);
        }

        channels[chan].addClient(request.raw.req, request.raw.res);
        return reply.close({ end: false });
    }
});

// Serve static files for the demo
server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
        directory: {
            path: path.join(__dirname, '..', 'client')
        }
    }
});

server.start(function() {
    console.log('Listening on %s', server.info.uri);
});
