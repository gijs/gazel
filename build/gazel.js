'use strict';
var gazel = gazel || {};

var exists = function (obj) {
    return typeof obj !== "undefined" && obj != null;
};

window.indexedDB = window.indexedDB || window.mozIndexedDB
        || window.msIndexedDB || window.webkitIndexedDB || window.oIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction;

function complete(func, params) {
    if (exists(func) && typeof func === "function") {
        func.apply(null, params);
    }
};

function error(e) {
    gazel._events.forEach(function (item) {
        if (item.name.toUpperCase() === "ERROR") {
            item.action(e);
        }
    });
};
function Queue() {

};

Queue.prototype = {
    items: [],
    results: [],
    add: function (action) {
        this.items.push(action);
    },
    complete: function () { },
    flush: function () {
        var args = Array.prototype.slice.call(arguments);
        if (args.length > 0) { this.results.push(args); }
        if (this.items.length > 0) {
            var action = this.items.shift();
            action();
        } else { // Complete, callback.
            var results = this.results;
            this.clear();
            this.complete(results);
        }
    },
    clear: function () {
        this.items = [];
        this.results = [];
    }
};

Queue.create = function () {
        return new Queue;
};function openDatabase(osName, onsuccess) {
    var db;

    var req = window.indexedDB.open(gazel.dbName, gazel.version);
    req.onupgradeneeded = function () {
        var os = db.createObjectStore(osName);
    };
    req.onsuccess = function (e) {
        db = e.target.result;
        doUpgrade(db, osName, onsuccess);
    };
    req.onerror = error;
};

function openReadable(osName, onsuccess) {
    openDatabase(osName, function (db) {
        var tx = db.transaction([osName], IDBTransaction.READ);
        tx.onerror = error;
        complete(onsuccess, [tx]);
    });
};

function openWritable(osName, onsuccess) {
    openDatabase(osName, function (db) {
        var tx = db.transaction([osName], IDBTransaction.READ_WRITE);
        tx.onerror = error;
        complete(onsuccess, [tx]);
    });
};

function doUpgrade(db, osName, done) {
    if (db.setVersion && Number(db.version) !== gazel.version) {
        var req = db.setVersion(gazel.version);
        req.onsuccess = function (e) {
            var tx = e.target.result;
            if (!db.objectStoreNames.contains(osName)) {
                db.createObjectStore(osName);
            }
            complete(done, [db]);
        };
    } else {
        complete(done, [db]);
    }
};
gazel.version = 2;
gazel.dbName = "gazeldb";
gazel.osName = "gazelos";

gazel.compatible = exists(window.indexedDB) && exists(window.localStorage)
    && exists(window.IDBTransaction);

gazel._events = [];
gazel._multi = false;
gazel._queue = Queue.create();

gazel.on = function (name, action) {
    gazel._events.push({
        name: name,
        action: action
    });

    return gazel;
};

gazel.get = function (key, onsuccess) {
    var get = function () {
        var n = gazel.osName;
        openReadable(n, function (tx) {
            var req = tx.objectStore(n).get(key);
            req.onerror = error;
            req.onsuccess = function (e) {
                complete(onsuccess, [e.target.result]);
            };
        });
    };

    if (gazel._multi) {
        onsuccess = gazel._queue.flush.bind(gazel._queue);
        gazel._queue.add(get);
    } else {
        get();
    }

    return gazel;
};

gazel.set = function (key, value, onsuccess) {
    var set = function () {
        var n = gazel.osName;
        openWritable(n, function (tx) {
            var req = tx.objectStore(n).put(value, key);
            req.onerror = error;
            req.onsuccess = function (e) {
                complete(onsuccess, [e.target.result]);
            };
        });
    };

    if (gazel._multi) {
        onsuccess = gazel._queue.flush.bind(gazel._queue);
        gazel._queue.add(set);
    } else {
        set();
    }

    return gazel;
};

gazel.incr = function (key, by, onsuccess) {
    var incr = function () {
        var n = gazel.osName;
        openWritable(n, function (tx) {
            var req = tx.objectStore(n).get(key);
            req.onerror = error;
            req.onsuccess = function (e) {
                var value = e.target.result += by;

                req = tx.objectStore(n).put(value, key);
                req.onerror = error;
                req.onsuccess = function (e) {
                    complete(onsuccess, [e.target.result]);
                };
            };
        });
    };

    if (gazel._multi) {
        onsuccess = gazel._queue.flush.bind(gazel._queue);
        gazel._queue.add(incr);
    } else {
        incr();
    }

    return gazel;
};

this.gazel = gazel;
gazel.multi = function () {
    // Let gazel know that we are in a multi.
    gazel._multi = true;
    return gazel;
};

gazel.exec = function (complete) {
    // Finalize the execution stack.
    gazel._queue.complete = complete;
    gazel._queue.flush();
};