var server = require('../backend')
	, models = require('ng-models')
	, config = require('../config')
	, fs = require('fs')
	, mongoose = require('mongoose')
	, ProcessManager = require('../ProcessManager')
	, bugsnag = require('bugsnag')
	, redis = require('redis')

exports.router = function () {
	var client = redis.createClient();
	
	if (config.env == 'production') {
		client.auth(config.redis_key)
	}

	// Is listening for redis $push of the server id.
	client.subscribe('server_'+server.server.identifier);
	
	client.on("message", function (channel, message) {
		var msg = null;
		
		try {
			msg = JSON.parse(message);
		} catch (e) {
			console.log("Failed parsing", message, e);
			Bugsnag.notifyException(e);
		}
		
		console.log(msg);
		
		switch(msg.action) {
			case 'start':
				return startDrone(msg);
			case 'stop':
				return stopDrone(msg);
		}
	});
}

function getAppProcess(socket, data, cb) {
	var id = data.id;
	
	models.AppProcess.findById(id, function(err, app_process) {
		if (err) throw err;
		
		if (!app_process) {
			cb(null);
		}

		var process = ProcessManager.manageProcess(app_process)
		cb(process, app_process);
	})
}

function startDrone(data) {
	getAppProcess(this, data, function(process, app_process) {
		if (process == null) {
			console.log("Null process, app not found?")
			return;
		}

		if (process.running) {
			console.log("Process already running.");
			return;
		}

		process.start();
		
		console.log("Started App Manually")
	})
}

function stopDrone(data) {
	getAppProcess(this, data, function(process, app_process) {
		if (process == null) {
			console.log("Null process, app not found?")
			return;
		}
		
		process.stop();
		
		console.log("Stopped App Manually")
	})
}