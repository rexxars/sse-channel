/* global afterEach, describe, it */
'use strict';

var _ = require('lodash');
var assert = require('assert');
var http = require('http');
var url = require('url');
var serverInit = require('./util/server-init');
var EventSource = require('eventsource');

describe('sse-channel', function() {
    this.timeout(5000);

    var port = process.env.TESTING_PORT || 6775;
    var host = 'http://localhost:' + port;
    var server, channel, es, path = '/sse';

    function initServer(opts) {
        var tmp = serverInit(_.merge({}, { port: port, path: path }, opts || {}));
        server = tmp.server;
        channel = tmp.channel;
    }

    afterEach(function(done) {
        if (es) {
            es.close();
        }

        if (server && server.close) {
            return server.close(done);
        }

        done();
    });

    it('can broadcast simple message', function(done) {
        initServer();

        var text = 'First event!';

        channel.on('connect', function() {
            channel.send(text);
        });

        es = new EventSource(host + path);
        es.onmessage = function(e) {
            assert.equal(e.data, text);
            done();
        };
    });

    it('represents messages without event name as "message"', function(done) {
        initServer();

        channel.on('connect', function() {
            channel.send('Moo');
        });

        es = new EventSource(host + path);
        es.onmessage = function(e) {
            assert.equal(e.type, 'message');
            done();
        };
    });

    it('can broadcast messages with ID and type', function(done) {
        initServer();

        var data = 'Reign in Citra';

        channel.on('connect', function() {
            channel.send({ event: 'drink', data: data, id: 1337 });
        });

        es = new EventSource(host + path);
        es.addEventListener('drink', function(e) {
            assert.equal(e.lastEventId, '1337');
            assert.equal(e.type, 'drink');
            assert.equal(e.data, data);
            done();
        }, false);
    });

    it('can tell clients how long they should wait before reconnecting', function(done) {
        initServer();

        channel.on('connect', function() {
            var disconnected;

            // Tell clients to reconnect after approx 750 milliseconds
            var retryTime = 75, threshold = retryTime / 10;
            channel.retry(retryTime);

            // Remove the 'connect'-listener (for testing purposes, since we re-apply it below)
            channel.removeAllListeners();

            // Add a new connect listener that we can use to assert with
            channel.on('connect', function() {
                var timeUsed = Date.now() - disconnected;
                assert.ok(
                    timeUsed > (retryTime - threshold) && timeUsed < retryTime + threshold,
                    'Client did not reconnect after ~' + retryTime + 'ms'
                );

                done();
            });

            // Disconnect all clients on the channel
            disconnected = Date.now();
            channel.close();
        });

        es = new EventSource(host + path);
    });

    it('can provide a history of events if client is disconnected', function(done) {
        initServer();

        var id = 1337, msgCount = 0;
        for (var i = 0; i < 6; i++) {
            channel.send({ id: ++id, data: 'Event #' + id });
        }

        es = new EventSource(host + path, { headers: { 'Last-Event-Id': '1337' } });
        es.onmessage = function(e) {
            if (++msgCount !== 6) { return; }

            // Data should correspond to the last message we sent
            assert.equal(e.data, 'Event #' + id);
            done();
        };
    });

    it('can provide a history of events through "evs_last_event_id"-query param', function(done) {
        initServer();

        var id = 1337, msgCount = 0;
        for (var i = 0; i < 6; i++) {
            channel.send({ id: ++id, data: 'Event #' + id });
        }

        es = new EventSource(host + path + '?evs_last_event_id=1337');
        es.onmessage = function(e) {
            if (++msgCount !== 6) { return; }
            assert.equal(e.data, 'Event #' + id);
            done();
        };
    });

    it('can provide a history of events through "lastEventId"-query param', function(done) {
        initServer();

        var id = 1337, msgCount = 0;
        for (var i = 0; i < 6; i++) {
            channel.send({ id: ++id, data: 'Event #' + id });
        }

        es = new EventSource(host + path + '?lastEventId=1337');
        es.onmessage = function(e) {
            if (++msgCount !== 6) { return; }
            assert.equal(e.data, 'Event #' + id);
            done();
        };
    });

    it('does not send history by default', function(done) {
        initServer();

        var id = 1337, msgCount = 0;
        for (var i = 0; i < 6; i++) {
            channel.send({ id: ++id, data: 'Event #' + id });
        }

        es = new EventSource(host + path);
        es.onopen = function() {
            channel.send('Boom');
        };

        es.onmessage = function(e) {
            if (++msgCount === 1) {
                assert.equal(e.data, 'Boom');
                done();
            }
        };
    });

    it('provides a correct number of connections on channel', function(done) {
        initServer();

        var connections = channel.getConnectionCount();
        assert.equal(connections, 0, 'Initial connection count should be 0, got ' + connections);

        es = new EventSource(host + path);
        es.onopen = function() {
            connections = channel.getConnectionCount();
            assert.equal(connections, 1, 'Connection count after opening first connection should be 1, got ' + connections);

            process.nextTick(function() {
                var es2 = new EventSource(host + path);
                es2.onopen = function() {
                    connections = channel.getConnectionCount();
                    assert.equal(connections, 2, 'Connection count after opening second connection should be 2, got ' + connections);
                    es2.close();

                    setTimeout(function() {
                        connections = channel.getConnectionCount();
                        assert.equal(connections, 1, 'Connection count after disconnecting one session should be 1, got ' + connections);
                        done();
                    }, 25);
                };
            });
        };
    });

    it('sends automatic pings', function(done) {
        // We'll want to use some custom logic for the channel here
        var interval = 25;
        initServer({ pingInterval: interval });

        var opts = url.parse(host + path);
        opts.headers = { 'Accept': 'text/event-stream' };

        var req = http.request(opts, function(res) {
            var buf = '';
            res.on('data', function(chunk) {
                buf += chunk.toString();
            });

            setTimeout(function() {
                req.abort();
                assert.ok(
                    buf.match(/\:\n/g).length >= 5,
                    'Expected at least 5 pings within ' + (interval * 7) + 'ms'
                );
                done();
            }, interval * 7);
        });

        req.setNoDelay(true);
        req.end();
    });

    it('sends "preamble" if client requests it', function(done) {
        initServer();

        var opts = url.parse(host + path + '?evs_preamble=1');
        opts.headers = { 'Accept': 'text/event-stream' };

        var req = http.request(opts, function(res) {
            var buf = '';
            res.on('data', function(chunk) {
                buf += chunk.toString();

                if (buf.match(/\-{3}\n/)) {
                    assert.ok(
                        buf.match(/\:\-{2056,}/),
                        'Preamble of 2kb not present in response'
                    );

                    req.abort();
                    done();
                }
            });
        });

        req.setNoDelay(true);
        req.end();
    });

    it('auto-serializes objects/arrays as JSON by default', function(done) {
        initServer();

        channel.on('connect', function() {
            channel.send({ data: ['foo', 'bar'] });
            channel.send({ data: { 'foo': 'bar' } });
        });

        es = new EventSource(host + path);
        es.onmessage = function(e) {
            var data = JSON.parse(e.data);
            if (_.isArray(data)) {
                // Assume first message
                assert.equal(data[0], 'foo');
                assert.equal(data[1], 'bar');
            } else {
                // Assume object, second message
                assert.equal(data.foo, 'bar');
                done();
            }
        };
    });

    it('treats buffers as strings when autoSerialize is turned off', function(done) {
        initServer({ autoSerialize: false });

        var msg = 'Heard about this project called Imbo(.io)?';
        channel.on('connect', function() {
            channel.send({ data: new Buffer(msg) });
        });

        es = new EventSource(host + path);
        es.onmessage = function(e) {
            assert.equal(e.data, msg);
            done();
        };
    });
});