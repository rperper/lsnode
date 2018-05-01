#!/usr/bin/env node
/*
 * Copyright 2002-2018 Lite Speed Technologies Inc, All Rights Reserved.
 * LITE SPEED PROPRIETARY/CONFIDENTIAL.
 */

var EventEmitter = require('events').EventEmitter;
var os = require('os');
var fs = require('fs');
var http = require('http');
var util = require('util');
var net = require('net');

var nodeClusterErrCount = 0;
var meteorClusterErrCount = 0;
var socketObject = { fd: 0 };

function badPackageError(packageName) {
    return "You required the " + packageName + ", which is incompatible with " +
           "Litespeed, a non-functional shim was returned and your app may " +
           "still work. However, please remove the related code as soon as " +
           "possible.";
}

// Logs failure to install shim + extended debug info, but with strict spamming protection.
function errorMockingRequire(packageName, error, args, count) {
    if (count > 2) {
        return; // spam protect against repeated warnings
    }
    var msg = "Failed to install shim to guard against the " + packageName + 
              ". Due to: " + error.message + 
              ". You can safely ignore this warning if you are not using " + 
              packageName;
    msg += "\n\tNode version: " + process.version + "\tArguments: " + args.length;
    for (i = 0; i < args.length; i++) {
        if (i > 9) { // limit the amount of array elements we log
            break;
        }
        msg += "\n\t[" + i + "] " + util.inspect(args[i]).substr(0, 200); 
        // limit the characters per array element
    };
    console.error(msg);
}

//Mock out Node Cluster Module
var Module = require('module');
var originalRequire = Module.prototype.require;
Module.prototype.require = function() {
    try {
        if (arguments['0'] == 'cluster') {
            console.trace(badPackageError("Node Cluster module"));
            return {
                disconnect      : function(){return false;},
                fork            : function(){return false;},
                setupMaster     : function(){return false;},
                isWorker        : true,
                isMaster        : false,
                schedulingPolicy: false,
                settings        : false,
                worker          : false,
                workers         : false,
            };
        }
    } catch (e) {
        nodeClusterErrCount++;
        errorMockingRequire("Node Cluster module", e, arguments, 
                            nodeClusterErrCount);
    }
    return originalRequire.apply(this, arguments);
};

//Mock out Meteor Cluster Module
var vm = require('vm');
var orig_func = vm.runInThisContext;
vm.runInThisContext = function() {
    try {
        if (arguments.length > 1) {
            var scriptPath = arguments['1'];
            if (typeof scriptPath == 'object') {
                scriptPath = scriptPath['filename'];
            }
            if (scriptPath.indexOf('meteorhacks_cluster') != -1) {
                console.trace(badPackageError("Meteorhacks cluster package"));
                return (function() {
                    Package['meteorhacks:cluster'] = {
                        Cluster: {
                            _publicServices          : {},
                            _registeredServices      : {},
                            _discoveryBackends       : { mongodb: {} },
                            connect                  : function(){return false;},
                            allowPublicAccess        : function(){return false;},
                            discoverConnection       : function(){return false;},
                            register                 : function(){return false;},
                            _isPublicService         : function(){return false;},
                            registerDiscoveryBackend : function(){return false;},
                            _blockCallAgain          : function(){return false;}
                        }
                    };
                });
            }
        }
    } catch (e) {
        meteorClusterErrCount++;
        errorMockingRequire("Meteorhacks Cluster package", e, arguments, 
                            meteorClusterErrCount);
    }
    return orig_func.apply(this, arguments);
};

module.isApplicationLoader = true; 
global.LitespeedNodeJS = exports.LitespeedNodeJS = new EventEmitter();
setupEnvironment();

function setupEnvironment(/*options*/) {
    LitespeedNodeJS._appInstalled = false;

    process.title = 'Litespeed Node.js Service'/* + options.app_root*/;
    if (process.env.LSNODE_ROOT != undefined)
    {
        try 
        {
            process.chdir(process.env.LSNODE_ROOT);
            console.log("Set directory to: " + process.env.LSNODE_ROOT);
        }
        catch (err)
        {
            console.error("Error setting directory to: " + 
                          process.env.LSNODE_ROOT + ": " + err);
        }
    }    
    http.Server.prototype.originalListen = http.Server.prototype.listen;
    http.Server.prototype.listen = installServer;

    loadApplication();
}


function loadApplication() {
    var startupFile;
    if (process.env.LSNODE_STARTUP_FILE != undefined)
    {
        if (process.env.LSNODE_STARTUP_FILE.slice(0,0) == '/')
        {
            startupFile = process.env.LSNODE_STARTUP_FILE;
            console.log("Starting fully qualified LSNODE_STARTUP_FILE: " + 
                        startupFile);
        }
        else if (process.env.LSNODE_ROOT != undefined)
        {
            startupFile = process.env.LSNODE_ROOT + '/' + 
                          process.env.LSNODE_STARTUP_FILE;
            console.log("Starting LSNODE_ROOT + unqualfied LSNODE_STARTUP_FILE: " + 
                        startupFile);
        }
        else 
        {
            startupFile = process.cwd() + '/' + process.env.LSNODE_STARTUP_FILE;
            console.log("Starting cwd + unqualfied LSNODE_STARTUP_FILE: " + 
                        startupFile);
        }
    }
    else
    {
        startupFile = process.cwd() + '/app.js'; // can change default directory first
        console.log("Starting default application: " + startupFile);
    }
    require(startupFile);
}

function extractCallback(args) {
    if (args.length > 1 && typeof(args[args.length - 1]) == 'function') {
        return args[args.length - 1];
    }
}

function addListenerAtBeginning(emitter, event, callback) {
    var listeners = emitter.listeners(event);
    var i;
    emitter.removeAllListeners(event);
    emitter.on(event, callback);
    for (i = 0; i < listeners.length; i++) {
        emitter.on(event, listeners[i]);
    }
}

function doListen(server, listenTries, callback) {
    server.originalListen(socketObject, function() {
        doneListening(server, callback);
        process.nextTick(finalizeStartup);
    });
}

function doneListening(server, callback) {
    if (callback) {
        server.once('listening', callback);
    }
    server.emit('listening');
}

function installServer(port) {
    // The replacement for the listen call!
    var server = this;
    if (!LitespeedNodeJS._appInstalled) {
        LitespeedNodeJS._appInstalled = true;
        LitespeedNodeJS._server = server;

        // Ensure that req.connection.remoteAddress and remotePort return 
        // something rather than undefined. 
        addListenerAtBeginning(server, 'request', function(req) {
            req.connection.__defineGetter__('remoteAddress', function() {
                return '127.0.0.1';
            });
            req.connection.__defineGetter__('remotePort', function() {
                return port;
            });
            req.connection.__defineGetter__('addressType', function() {
                return 4;
            });
        });
        
        var listenTries = 0;
        
        doListen(server, listenTries, extractCallback(arguments));
        return server;
    } else {
        throw new Error("http.Server.listen() was called more than once " +
                        "which is not allowed.");
    }
}


function finalizeStartup() {
    // Ready to go.
}

function shutdown() {
    if (LitespeedNodeJS.shutting_down) {
        return;
    }

    LitespeedNodeJS.shutting_down = true;
    if (LitespeedNodeJS.listeners('exit').length > 0) {
        LitespeedNodeJS.emit('exit');
    } else if (process.listeners('message').length > 0) {
        process.emit('message', 'shutdown');
    } else {
        process.exit(0);
    }
}
