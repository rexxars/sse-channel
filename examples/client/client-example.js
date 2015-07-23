'use strict';

(function(doc) {
    var freeMemCanvas = doc.getElementById('freemem'),
        loadAvgCanvas = doc.getElementById('loadavg'),
        freeMemHistory = [],
        loadAvgHistory = [],
        randomNumberEl = doc.getElementById('random-numbers');

    /**
     * =======================
     * System-info EventSource
     * =======================
     */

    /**
     * Here's a neat trick: EventSource doesn't let you specify the Last-Event-Id
     * header when connecting (unless it is automatically reconnecting), but with
     * `sse-channel` you are able to specify it as a query parameter. This can be
     * useful if you know the range of the event IDs. Alternatively, you could
     * just specify a low event ID, in which case it returns the last entries up
     * to the history limit.
     */
    var sysInfoSource = new window.EventSource('/channel/sysInfo?lastEventId=0');

    // We're using custom event names instead of an 'onmessage'-listener here - neat?
    sysInfoSource.addEventListener('freemem', function(e) {
        freeMemHistory.push(e.data | 0);
        if (freeMemHistory.length > 300) {
            freeMemHistory.shift();
        }

        drawChart(freeMemCanvas, freeMemHistory);
    }, false);

    // And the same for the load average...
    sysInfoSource.addEventListener('loadavg', function(e) {
        loadAvgHistory.push(e.data);
        if (loadAvgHistory.length > 300) {
            loadAvgHistory.shift();
        }

        drawChart(loadAvgCanvas, loadAvgHistory);
    }, false);

    /**
     * =========================
     * Random number EventSource
     * =========================
     */
    var randomNumberSource = new window.EventSource('/channel/random');
    randomNumberSource.onmessage = function(e) {
        // Remove last element in list if we've reached 20 items
        var nodes = randomNumberEl.childNodes.length;
        if (nodes > 20) {
            randomNumberEl.removeChild(randomNumberEl.childNodes[nodes - 1]);
        }

        // We're sending the data as JSON (auto-serialized on the server side)
        // So we'll have to parse it on the client-side
        var data = JSON.parse(e.data);

        // Create the element and add it to the top of the list
        var newEl = doc.createElement('li');
        newEl.innerHTML = '[' + data.time.substr(11, 8) + '] ' + data.randomNumber.toFixed(5);
        randomNumberEl.insertBefore(newEl, randomNumberEl.firstChild);
    };

    // Just a simple chart drawer, not related to SSE-channel
    function drawChart(canvas, data) {
        var ctx = canvas.getContext('2d'),
            color = 'rgba(0, 0, 0, 0.75)',
            height = canvas.height - 2,
            width = canvas.width,
            total = data.length,
            max = Math.max.apply(Math, data),
            xstep = 1,
            ystep = max / height,
            x = 0,
            y = height - data[0] / ystep;

        ctx.clearRect(0, 0, width, height);
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.moveTo(x, y);

        for (var i = 1; i < total; i++) {
            x += xstep;
            y = height - data[i] / ystep + 1;
            ctx.moveTo(x, height);
            ctx.lineTo(x, y);
        }

        ctx.stroke();
    }
}(document));
