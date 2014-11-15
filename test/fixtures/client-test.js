'use strict';

var msgCount = 0, lastMessage;
var es = new window.EventSource(window.location.href + 'sse');
var els = {
    log: document.getElementById('log'),
    msgCount: document.getElementById('message-count')
};

function onMsg(e) {
    lastMessage = e;
    msgCount++;
    els.msgCount.innerHTML = msgCount;

    var li = document.createElement('li');
    li.setAttribute('id', 'event-' + (e.lastEventId || ('num-' + msgCount)));
    li.appendChild(document.createTextNode(e.data));
    els.log.appendChild(li);
}

es.addEventListener('message', onMsg, false);
es.addEventListener('drink', onMsg, false);

window.getLastMessage = function() {
    return window.getLastMessageProp('data');
};

window.getLastMessageProp = function(prop) {
    return lastMessage[prop];
};

window.getMessageCount = function() {
    return msgCount;
};