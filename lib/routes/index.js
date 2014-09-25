var server = require('../backend')
	, models = require('ng-models')
	, config = require('../config')
	, fs = require('fs')
	, mongoose = require('mongoose')
	, ProcessManager = require('../ProcessManager')
	, bugsnag = require('bugsnag')
	, redis = require('redis')

server.bus.on('app:stop', function(data) {
	server.redis_client.exists("git_update_"+data.process, function(err, exists) {
		if (err) throw err;

		if (!exists) {
			return;
		}

		// Start the process..
		getAppProcess({}, {
			id: data.process
		}, function (process, app_process) {
			if (process == null) {
				console.log("Null process, app not found?");
				return;
			}
			
			if (process.running) {
				console.log("Process still running. wtf");
				return;
			}
			
			console.log("Starting process after git stop");
			
			process.start();
		})
	})
})

exports.router = function () {
	var client = redis.createClient(config.credentials.redis_port, config.credentials.redis_host);
	
	if (config.production) {
		client.auth(config.credentials.redis_key)
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
		
		console.log('Router msg', msg);
		
		switch(msg.action) {
			case 'start':
				return startDrone(msg);
			case 'stop':
				return stopDrone(msg);
			case 'restart_uptime':
				return restart_uptime(msg);
			case 'restart':
				return restart(msg);
		}
	});
}

function getAppProcess(socket, data, cb) {
	var id = data.id;
	
	models.AppProcess.findById(id, function (err, app_process) {
		if (err) throw err;
		
		if (!app_process) {
			cb(null);
		}

		var process = ProcessManager.manageProcess(app_process)
		cb(process, app_process);
	})
}
exports.getAppProcess = getAppProcess;

function startDrone(data) {
	getAppProcess(this, data, function (process, app_process) {
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
exports.startDrone = startDrone;

function stopDrone(data) {
	getAppProcess(this, data, function (process, app_process) {
		if (process == null) {
			console.log("Null process, app not found?")
			return;
		}
		
		process.stop();
		
		console.log("Stopped App Manually")
	})
}
exports.stopDrone = stopDrone;

function restart_uptime(data) {
	getAppProcess(this, data, function (process, app_process) {
		if (process == null) {
			console.log("Null process, app not found?")
			return;
		}

		var uptime = process.createUptime();
		uptime.start = Date.now();
		uptime.save();
	})
}
exports.restart_uptime = restart_uptime;

function restart(data) {
	getAppProcess(this, data, function (process, app_process) {
		if (process == null) {
			console.log("Null process, app not found?");
			return;
		}

		if (process.running) {
			// Stop and wait for stop event. then start.
			server.redis_client.set("git_update_"+process._id, "1", function(err) {
				if (err) throw err;

				server.redis_client.expire("git_update_"+process._id, 60, function(err) {
					if (err) throw err;

					process.stop();
					console.log("Process stopped.. Added to queue");
				})
			})
		} else {
			// Start it!
			process.start();
			console.log("Restart. Started app, because nothing running");
		}
	})
}
exports.restart = restart;
