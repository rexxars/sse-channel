/*global describe, it, before, beforeEach, afterEach */
'use strict';

var _ = require('lodash');
var serverInit = require('./util/server-init');
var devices = require('./util/devices');
var webdriverio = require('webdriverio');
var assert = require('assert');
var testBrowsers = process.env.RUN_BROWSER_TESTS || process.env.CONTINUOUS_INTEGRATION;
var describeTest = testBrowsers ? describe : describe.skip;

describeTest('browsers', function() {
    this.timeout(15000); // It's Selenium.

    var defaults = {
        'build': process.env.TRAVIS_BUILD_NUMBER,
        'username': process.env.SAUCE_USERNAME,
        'accessKey': process.env.SAUCE_ACCESS_KEY
    };

    var wdOpts = process.env.CONTINUOUS_INTEGRATION ? {
        host: 'ondemand.saucelabs.com',
        port: 80,
        user: process.env.SAUCE_USERNAME,
        key:  process.env.SAUCE_ACCESS_KEY,
        logLevel: 'silent'
    } : {};

    devices.forEach(function(device, i) {
        var caps = _.merge({}, defaults, device);
        var version = device.version ? (' (v' + device.version + ')') : '';
        var platform = caps.platform ? (' - ' + caps.platform) : '';

        describe(caps.browserName + version + platform, function() {
            var wdOptions = _.merge(wdOpts, {
                desiredCapabilities: caps
            });

            var port = process.env.TESTING_PORT || (6775 + i);
            var host = 'http://localhost:' + port;
            var server, channel, wd;

            function assertLastMessage(msg, callback) {
                wd.execute(function() {
                    return window.getLastMessage();
                }, function(err, ret) {
                    var expected = JSON.stringify(msg),
                        received = JSON.stringify(ret.value || ret);

                    assert.equal(
                        expected,
                        received,
                        'Browser received ' + received + ', expected ' + expected
                    );
                    callback(err, ret);
                });
            }

            function assertLastMessageProp(prop, value, callback) {
                wd.execute(function(prop) {
                    return window.getLastMessageProp(prop);
                }, [prop], function(err, ret) {
                    if (err) {
                        console.error(err);
                    }

                    var expected = JSON.stringify(value),
                        received = JSON.stringify(ret ? ret.value || ret : null);

                    assert.equal(
                        expected,
                        received,
                        'Browser received ' + received + ', expected ' + expected + ' (' + prop + '-property)'
                    );
                    callback(err, ret);
                });
            }

            function assertMessageCount(count, callback) {
                wd.execute(function() {
                    return window.getMessageCount();
                }, function(err, ret) {
                    assert.equal(
                        count,
                        ret.value || ret,
                        'Browser received ' + (ret.value || ret) + ' messages, expected ' + count
                    );
                    callback(err, ret);
                });
            }

            before(function() {
                wd = (webdriverio.remote(wdOptions));
            });

            beforeEach(function() {
                var tmp = serverInit({ port: port, path: '/sse' });
                server = tmp.server;
                channel = tmp.channel;

                wd.init().url(host);
            });

            afterEach(function(done) {
                wd.end();

                if (server && server.close) {
                    return server.close(done);
                }

                done();
            });

            it('can broadcast simple message', function(done) {
                channel.on('connect', function() {
                    var text = 'First event!';
                    channel.send(text);

                    var whenDone = _.after(2, done);
                    assertLastMessage(text, whenDone);
                    assertMessageCount(1, whenDone);
                });
            });

            it('represents messages without event name as "message"', function(done) {
                channel.on('connect', function() {
                    channel.send('Moo');
                    assertLastMessageProp('type', 'message', done);
                });
            });

            it('can broadcast messages with ID and type', function(done) {
                channel.on('connect', function() {
                    var data = 'Reign in Citra';
                    channel.send({ event: 'drink', data: data, id: 1337 });

                    var whenDone = _.after(3, done);
                    assertLastMessageProp('lastEventId', '1337', whenDone);
                    assertLastMessageProp('type', 'drink', whenDone);
                    assertLastMessage(data, whenDone);
                });
            });

            it('can tell clients how long they should wait before reconnecting', function(done) {
                channel.on('connect', function() {
                    var disconnected;

                    // Tell clients to reconnect after approx 750 milliseconds
                    var retryTime = 750, threshold = retryTime / 10;
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
            });

            it('can provide a history of events if client is disconnected', function(done) {
                channel.on('connect', function() {
                    var id = 1337;

                    // Tell clients to reconnect after approx 1.5 second
                    channel.retry(1500);

                    // Send an initial message that the client will receive
                    channel.send({ id: id, data: 'Event #' + id });

                    // Remove the 'connect'-listener (for testing purposes, since we re-apply it below)
                    channel.removeAllListeners();

                    // Add a new connect listener that we can use to assert with
                    channel.on('connect', function() {
                        var whenDone = _.after(3, done);

                        // We should now have 6 messages (the original message, plus 5 we add below)
                        assertMessageCount(6, whenDone);

                        // Last ID should be current ID, since messages should be sent/received in correct order
                        assertLastMessageProp('lastEventId', String(id), whenDone);

                        // Data should correspond to the last message we sent
                        assertLastMessage('Event #' + id, whenDone);
                    });

                    // Disconnect all clients on the channel
                    channel.close(function() {
                        // Quickly send 5 new messages (before client reconnects)
                        for (var i = 0; i < 5; i++) {
                            channel.send({ id: ++id, data: 'Event #' + id });
                        }
                    });
                });
            });
        });
    });
});