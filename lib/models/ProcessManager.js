var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, fs = require('fs.extra')
	, async = require('async')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, server = require('../server')
	, config = require('../config')
	, usage = require('usage')
	, npm = require('npm')
	, Event = require('./Event')
	, Drone = require('./Drone')

var processes = [];

var Process = function(drone) {
	this.drone = drone._id;
	this.proc = null;
}

exports.manageProcess = function(drone, proc) {
	if (typeof proc === 'undefined') {
		proc = null;
	}
	
	var process = exports.getProcess(drone);
	if (process) return process;
	
	process = new Process(drone, proc);
	processes.push(process)
	
	return process;
}

exports.getProcess = function (drone) {
	for (var i = 0; i < processes.length; i++) {
		if (processes[i].drone.equals(drone._id)) {
			// Already managing it
			return processes[i];
		}
	}
	
	return null;
}

Process.prototype.getDrone = function (cb) {
	Drone.findById(this.drone).populate('user').exec(function(err, drone) {
		if (err || !drone) {
			return cb(null);
		}
		
		cb(drone);
	});
}

Process.prototype.processExit = function() {
	var self = this;
	
	self.getDrone(function(drone) {
		// Cannot Start process
		console.log("Process permanently dead")
		server.proxy.removeDrone(drone)
	
		if (drone.isRunning == true) {
			// was not paused intentionally, not a crash.
			Drone.AddEvent(drone._id, "Shut Down", "Life of process unsustainable. Please refer to logs for more information")
			drone.user.notifyUser("[DOWN] "+drone.name, "Your Drone "+drone.name+" has gone permanently down. stack trace: abcd. Resurrect in your admin console.<br/><br/>Have a nais day")
		}
	
		drone.isRunning = false;
		drone.pid = 0;
		drone.save();
	})
}

Process.prototype.processStart = function(proc, data) {
	var self = this;
	
	this.getDrone(function(drone) {
		console.log("Started")
		console.log(data.toString());
		console.log("Drone started")
	
		Drone.AddEvent(drone._id, "Start", "Has been Started")
	
		var pid = proc.child.pid;
		drone.pid = pid;
	
		drone.isRunning = true;
		drone.save();
	
		server.proxy.updatePid(drone);
	});
}

Process.prototype.processStop = function(proc) {
	var self = this;
	
	self.getDrone(function(drone) {
		console.log("Process stopped")
	
		Drone.AddEvent(drone._id, "Stop", "Stopped")
	
		drone.isRunning = false;
		drone.pid = 0;
		drone.save();
	
		server.proxy.removeDrone(drone)
	});
}

Process.prototype.processRestart = function(proc) {
	var self = this;
	
	self.getDrone(function(drone) {
		console.log("Process Restarted")
		
		Drone.AddEvent(drone._id, "Restart", "Has been restarted")
		
		var pid = proc.child.pid;
		drone.pid = pid;
		
		server.proxy.updateDrone(drone)
		
		drone.isRunning = true;
		
		drone.save()
	});
}

Process.prototype.start = function () {
	var self = this;
	
	self.getDrone(function(drone) {
		// Start a forever process
		
		if (!drone.script) {
			console.log("No Way to Start Application!");
			return;
		}
		
		// Proxy the drone
		server.proxy.proxyDrone(drone); // TODO assign drone
		
		var now = Date.now()
		var logLoc = config.droneLocation + drone.user._id + "/logs/" + drone._id + "." + now + ".log";
		
		drone.logs.push({
			created: now,
			location: logLoc
		})
		drone.save(); //its being saved later, but it might not happen.
		
		var env = {};
		env.NODE_ENV = 'production';
		for (var i = 0; i < drone.env.length; i++) {
			env[drone.env[i].name] = drone.env[i].value;
		}
		env.PORT = drone.port;
		
		self.proc = proc = new (forever.Monitor)(drone.script, {
			max: 3,
			silent: false,//process.env.NODE_ENV == 'production' ? true : false,
			minUptime: 500,
			sourceDir: drone.location,
			env: env, // Define app environment
			cwd: drone.location,
			killTree: true,
			outFile: logLoc,
			errFile: logLoc,
			spawnWith: {
				uid: drone.user.uid,
				gid: drone.user.gid
			}
		});
		
		proc.on('exit', function() {
			self.processExit()
		});
		proc.on('start', function(proc, data) {
			self.processStart(proc, data)
		});
		proc.on('stop', function(proc) {
			self.processStop(proc)
		});
		proc.on('restart', function(proc) {
			self.processRestart(proc)
		});
		
		console.log(proc._env);
		
		// Start the process
		proc.start();
	})
}

Process.prototype.stop = function () {
	var self = this;
	
	self.getDrone(function(drone) {
		// todo proxy.removeProxy drone
		console.log("Stopping")
	
		console.log(drone);
	
		// TODO server.processes.splice(proc)
		drone.isRunning = false;
		drone.save();
	
		if (this.proc) {
			self.proc.stop();
			console.log("Stopped with proc");
		} else {
			console.log("Force-stop pid")
		
			if (!this.pid || this.pid == 0) {
				console.log("No PID. WTF?");
				return;
			}
			
			forever.kill(drone.pid, true, 'SIGKILL', function() {
				console.log("Stopped using force")
			})
		}
	})
}

Process.prototype.restart = function () {
	var self = this;
	
	self.getDrone(function(drone) {
		// TODO weird proxy behaviour..
		console.log("Restarting")
	
		if (self.proc) {
			var env = self.proc._env;
			env.NODE_ENV = 'production';
			for (var i = 0; i < drone.env.length; i++) {
				env[drone.env[i].name] = drone.env[i].value;
			}
			env.PORT = drone.port;
			
			console.log(self.proc._env);
			
			self.proc.restart();
			console.log("Restarted")
		} else {
			console.log("Cannot restart, stopping")
			self.stop()
		}
	})
}
