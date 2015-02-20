var server = require('../backend'),
	models = require('ng-models'),
	config = require('../config'),
	fs = require('fs'),
	mongoose = require('mongoose'),
	ProcessManager = require('../ProcessManager'),
	bugsnag = require('bugsnag'),
	redis = require('redis'),
	logtrail = require('logtrail');

server.bus.on('app:stop', function app_stop (data) {
	logtrail.trace('enter bus app:stop');

	server.redis_client.exists("git_update_"+data.process, function (err, exists) {
		logtrail.trace('enter redis exists git_update_'+data.process, err, exists);

		if (err) {
			logtrail.fatal(err);
			throw err;
		}

		if (!exists) {
			logtrail.trace('redis git_update_'+data.process, 'does not exist');
			return;
		}

		// Start the process..
		getAppProcess({}, {
			id: data.process
		}, function getAppProcessCallback (process, app_process) {
			logtrail.trace('enter getAppProcessCallback', process, app_process);

			if (process == null) {
				logtrail.trace("Null process, app not found?");
				return;
			}
			
			if (process.running) {
				logtrail.trace("Process still running. wtf");
				return;
			}
			
			logtrail.trace("Starting process after git stop");
			
			process.start();
		});
	});
});

exports.router = function () {
	logtrail.trace('enter router');

	var client = redis.createClient(config.credentials.redis_port, config.credentials.redis_host);
	
	if (config.credentials.redis_key.length > 0) {
		client.auth(config.credentials.redis_key)
	}

	// Is listening for redis $push of the server id.
	client.subscribe('server_'+server.server.identifier);
	
	client.on("message", function (channel, message) {
		var msg = null;
		

		try {
			msg = JSON.parse(message);
		} catch (e) {
			logtrail.error("Failed parsing", message, e);
			Bugsnag.notifyException(e);

			return;
		}
		
		logtrail.info('Router msg', msg);
		config.metrics.increment('backend.'+server.server.identifier+'.requests.'+msg.action);
		
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

function getAppProcess (socket, data, cb) {
	logtrail.trace('enter getAppProcess', data);

	var id = data.id;
	
	models.AppProcess.findById(id, function (err, app_process) {
		logtrail.trace('enter appProcessFind', err, app_process);

		if (err) throw err;
		
		if (!app_process) {
			cb(null);
		}

		var process = ProcessManager.manageProcess(app_process)
		cb(process, app_process);
	});
}
exports.getAppProcess = getAppProcess;

function startDrone (data) {
	logtrail.trace('enter startDrone', data);
	
	getAppProcess(this, data, function (process, app_process) {
		logtrail.trace('enter getAppProcess', process, app_process);

		if (process == null) {
			logtrail.warn("Null process, app not found?")
			return;
		}

		if (process.running) {
			logtrail.warn("Process already running.");
			return;
		}

		process.start();
		
		logtrail.trace("Started App Manually")
	})
}
exports.startDrone = startDrone;

function stopDrone (data) {
	logtrail.trace('enter stopDrone', data);
	
	getAppProcess(this, data, function (process, app_process) {
		logtrail.trace('enter getAppProcess', process, app_process);
		if (process == null) {
			logtrail.warn("Null process, app not found?")
			return;
		}
		
		process.stop();
		
		logtrail.log("Stopped App Manually")
	})
}
exports.stopDrone = stopDrone;

function restart_uptime (data) {
	logtrail.trace('enter restart_uptime', data);

	getAppProcess(this, data, function (process, app_process) {
		logtrail.trace('enter getAppProcess', process, app_process);

		if (process == null) {
			logtrail.warn("Null process, app not found?")
			return;
		}

		var uptime = process.createUptime();
		uptime.start = Date.now();
		uptime.save();
	})
}
exports.restart_uptime = restart_uptime;

function restart (data) {
	logtrail.trace('enter restart', data);

	getAppProcess(this, data, function (process, app_process) {
		logtrail.trace('enter getAppProcess', process, app_process);

		if (process == null) {
			logtrail.warn("Null process, app not found?");
			return;
		}

		if (process.running) {
			// Stop and wait for stop event. then start.
			server.redis_client.set("git_update_"+process._id, "1", function (err) {
				if (err) throw err;

				server.redis_client.expire("git_update_"+process._id, 60, function (err) {
					if (err) throw err;

					process.stop();
					logtrail.log("Process stopped.. Added to queue");
				});
			});
		} else {
			// Start it!
			process.start();
			logtrail.log("Restart. Started app, because nothing running");
		}
	});
}

exports.restart = restart;
