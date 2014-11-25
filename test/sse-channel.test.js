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

    it('can send messages to specific clients', function(done) {
        initServer();

        var privText = 'Private', count = 0;
        channel.on('connect', function(channel, req, res) {
            // Wait for two clients to connect
            if (++count !== 2) {
                return;
            }

            channel.send({ id: 1, data: privText }, [res]);
        });

        // Should not receive the message
        es = new EventSource(host + path);
        es.onmessage = function(e) {
            if (e.data === privText) {
                throw new Error('EventSource client #1 should not receive the private message');
            }
        };
        es.onopen = function() {
            // Should receive the message
            var es2 = new EventSource(host + path);
            es2.onmessage = function(e) {
                assert.equal(e.data, privText);
                es2.close();

                // Ensure the history is not populated with the "private" message
                var pubText = 'Public';
                channel.send({ id: 2, data: pubText });

                var es3 = new EventSource(host + path, { headers: { 'Last-Event-Id': '0' } });
                es3.onmessage = function(e) {
                    es3.close();
                    if (e.data === privText) {
                        throw new Error('"Private" message found in history');
                    }

                    assert.equal(e.data, pubText);
                    done();
                };
            };
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
        initServer({ retryTimeout: 3000 });

        channel.on('connect', function() {
            var disconnected;

            // Tell clients to reconnect after approx 75 milliseconds
            var retryTime = 75;
            channel.retry(retryTime);

            // Remove the 'connect'-listener (for testing purposes, since we re-apply it below)
            channel.removeAllListeners();

            // Add a new connect listener that we can use to assert with
            channel.on('connect', function() {
                var timeUsed = Date.now() - disconnected;
                assert.ok(
                    timeUsed > (retryTime * 0.25) && timeUsed < (retryTime * 1.75),
                    'Client did not reconnect after ~' + retryTime + 'ms ' +
                    '(reconnected after ' + timeUsed + 'ms)'
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

    it('sends the right slice of the history', function(done) {
        initServer();

        var id = 1337, msgCount = 0, lastMsg;
        for (var i = 0; i < 6; i++) {
            channel.send({ id: ++id, data: 'Event #' + id });
        }

        var assertMsgCount = _.debounce(function() {
            assert.equal(msgCount, 4);
            assert.equal(lastMsg.data, 'Event #' + id);
            done();
        }, 25);

        es = new EventSource(host + path + '?lastEventId=1339');
        es.onmessage = function(e) {
            msgCount++;
            lastMsg = e;
            assertMsgCount();
        };
    });

    it('only includes the latest event with the same ID', function(done) {
        initServer();

        var id = 1337, msgCount = 0, lastMsg;
        for (var i = 0; i < 6; i++) {
            channel.send({ id: 1337, data: 'Event #' + id });
        }

        var assertMsgCount = _.debounce(function() {
            assert.equal(msgCount, 1);
            assert.equal(lastMsg.data, 'Event #' + id);
            done();
        }, 25);

        es = new EventSource(host + path + '?lastEventId=1330');
        es.onmessage = function(e) {
            msgCount++;
            lastMsg = e;
            assertMsgCount();
        };
    });

    it('can be configured to a specific max history size', function(done) {
        initServer({ historySize: 5 });

        var id = 100, msgCount = 0, lastMsg;
        for (var i = 0; i < 100; i++) {
            channel.send({ id: ++id, data: 'Event #' + id });
        }

        var assertMsgCount = _.debounce(function() {
            assert.equal(msgCount, 5);
            assert.equal(lastMsg.data, 'Event #' + id);
            done();
        }, 25);

        es = new EventSource(host + path + '?lastEventId=110');
        es.onmessage = function(e) {
            msgCount++;
            lastMsg = e;
            assertMsgCount();
        };
    });

    it('can be given an array of events to pre-populate with', function(done) {
        var msgs = [], id = 1337;
        for (var i = 0; i < 10; i++) {
            msgs.push({ id: ++id, data: 'Event #' + id });
        }

        initServer({ historySize: 5, history: msgs });

        var msgCount = 0, lastMsg;
        var assertMsgCount = _.debounce(function() {
            assert.equal(msgCount, 5);
            assert.equal(lastMsg.data, 'Event #' + id);
            done();
        }, 25);

        es = new EventSource(host + path + '?lastEventId=1');
        es.onmessage = function(e) {
            msgCount++;
            lastMsg = e;
            assertMsgCount();
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

    it('can auto-encode data as JSON', function(done) {
        initServer({ jsonEncode: true });

        channel.on('connect', function() {
            channel.send({ data: ['foo', 'bar'] });
            channel.send({ data: { 'foo': 'bar' } });
            channel.send({ data: 'Foobar' });
        });

        es = new EventSource(host + path);
        es.onmessage = function(e) {
            var data = JSON.parse(e.data);
            if (_.isArray(data)) {
                // Assume first message
                assert.equal(data[0], 'foo');
                assert.equal(data[1], 'bar');
            } else if (_.isString(data)) {
                // Assume second message
                assert.equal(data, 'Foobar');
            } else {
                // Assume object, third message
                assert.equal(data.foo, 'bar');
                done();
            }
        };
    });

    it('does not JSON-encode data by default', function(done) {
        initServer();

        channel.on('connect', function() {
            channel.send({ data: { 'foo': 'bar' } });
        });

        es = new EventSource(host + path);
        es.onmessage = function(e) {
            assert.equal(e.data, '[object Object]');
            done();
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

    it('treats missing data property as empty string', function(done) {
        initServer({ autoSerialize: false });

        channel.on('connect', function() {
            channel.send({ id: 1337 });
        });

        es = new EventSource(host + path);
        es.onmessage = function(e) {
            assert.equal(e.data, '');
            done();
        };
    });

    it('handles multi-line strings properly', function(done) {
        initServer();

        var text = [
            'Line 1',
            'Line 2',
            '',
            'Line 4',
            'Line 5\n\n\n',
            'Line ..9?'
        ].join('\n');

        channel.on('connect', function() {
            channel.send(text);
        });

        es = new EventSource(host + path);
        es.onmessage = function(e) {
            assert.equal(e.data, text);
            done();
        };
    });

    it('does not allow CORS by default', function(done) {
        initServer();

        es = new EventSource(host + path, {
            headers: {
                Origin: 'http://imbo.io'
            }
        });

        es.onerror = function(e) {
            assert.equal(e.status, 403);
            done();
        };
    });

    it('can be configured to allow CORS', function(done) {
        initServer({ cors: {
            origins: ['http://imbo.io']
        }});

        var opts = url.parse(host + path);
        opts.method = 'OPTIONS';
        opts.headers = {
            'Accept': 'text/event-stream',
            'Origin': 'http://imbo.io',
            'Last-Event-Id': '1337',
            'Access-Control-Request-Method': 'GET'
        };

        var req = http.request(opts, function(res) {
            assert.equal(res.headers['access-control-allow-origin'], 'http://imbo.io');
            assert.equal(res.headers['access-control-allow-headers'], 'Last-Event-ID');

            req.abort();
            done();
        });

        req.end();
    });

    it('sends initial retry-timeout if specified in channel config', function(done) {
        initServer({ retryTimeout: 3000 });

        var opts = url.parse(host + path);
        opts.headers = { 'Accept': 'text/event-stream' };

        var req = http.request(opts, function(res) {
            var buf = '';
            res.on('data', function(chunk) {
                buf += chunk.toString();

                if (buf.length >= 17) {
                    assert.ok(buf.indexOf('retry: 3000\n') > -1);
                    req.abort();
                    done();
                }
            });
        });

        req.setNoDelay(true);
        req.end();
    });

    it('single event can contain event name, retry time, id and data', function(done) {
        initServer();

        var opts = url.parse(host + path);
        opts.headers = { 'Accept': 'text/event-stream' };

        var req = http.request(opts, function(res) {
            var buf = '';
            res.on('data', function(chunk) {
                buf += chunk.toString();

                if (buf.indexOf('Citra') > -1) {
                    assert.ok(buf.indexOf('\nevent: drink\n') > -1);
                    assert.ok(buf.indexOf('\nretry: 1800\n') > -1);
                    assert.ok(buf.indexOf('\nid: 1337\n') > -1);
                    assert.ok(buf.indexOf('\ndata: Reign in Citra\n') > -1);
                    req.abort();
                    done();
                }
            });

            channel.send({ retry: 1800, id: 1337, event: 'drink', data: 'Reign in Citra' });
        });

        req.setNoDelay(true);
        req.end();
    });
});
