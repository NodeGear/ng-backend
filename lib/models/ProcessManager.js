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
	this.processes = [];
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
	var self = this;
	
	Drone.findById(self.drone).populate('user').exec(function(err, drone) {
		if (err || !drone) {
			return cb(null);
		}
		
		cb(drone);
	});
}

Process.prototype.processExit = function(proc) {
	var self = this;
	
	self.getDrone(function(drone) {
		// Cannot Start process
		console.log("Process permanently dead")
		server.proxy.removeDrone(self, drone)
		
		if (drone.isRunning == true) {
			// was not paused intentionally, a crash.
			Drone.AddEvent(drone._id, "Shut Down", "Life of process unsustainable. Please refer to logs for more information")
			drone.user.notifyUser("[DOWN] "+drone.name, "Your Drone "+drone.name+" has gone permanently down. stack trace: abcd. Resurrect in your admin console.<br/><br/>Have a nais day")
		}
	
		drone.isRunning = false;
		drone.isRestarting = false;
		drone.pid = 0;
		drone.save();
	})
}

Process.prototype.processStart = function(proc, data) {
	var self = this;
	
	this.getDrone(function(drone) {
		console.log("Started")
		console.log("Drone started")
		
		Drone.AddEvent(drone._id, "Start", "Has been Started")
		
		server.proxy.updatePid(drone, proc);
		
		drone.pid = proc.child.pid;
		
		drone.isRunning = true;
		drone.save();
	});
}

Process.prototype.processStop = function(proc) {
	var self = this;
	
	self.getDrone(function(drone) {
		if (drone.isRestarting) {
			console.log("Stop event, doing nothing.")
			return;
		}
		
		console.log("Process stopped")
		
		Drone.AddEvent(drone._id, "Stop", "Stopped")
		
		server.proxy.removeProcess(drone, proc);
	});
}

Process.prototype.processRestart = function(proc) {
	var self = this;
	
	self.getDrone(function(drone) {
		console.log("Process Restarted")
		
		Drone.AddEvent(drone._id, "Restart", "Has been restarted")
		
		drone.isRestarting = false;
		
		server.proxy.updateDrone(drone, function() {
			drone.isRunning = true;
			
			drone.save()
		})
	});
}

Process.prototype.start = function () {
	var self = this;
	
	console.log("Starting :)")
	
	self.getDrone(function(drone) {
		// Start a forever process
		
		if (!drone.script) {
			console.log("No Way to Start Application!");
			return;
		}
		
		// Proxy the drone
		server.proxy.proxyDrone(drone);
		
		drone.isRestarting = false;
		
		self.scale(drone, drone.processes);
	})
}

Process.prototype.scale = function (drone, scale) {
	var self = this;
	
	if (self.processes.length == scale) {
		console.log("Not scaling.", self.processes.length, "==", scale);
	} else if (self.processes.length > scale) {
		console.log("Reducing procs. to", scale, "from", self.processes.length);
		
		for (var procs = self.processes.length; procs > scale; procs--) {
			self.killProcess(drone);
		}
	} else if (self.processes.length < scale) {
		console.log("Scaling from", self.processes.length, "to", scale);
		
		for (var procs = self.processes.length; procs < scale; procs++) {
			self.launchProcess(drone, procs);
		}
	}
}

Process.prototype.launchProcess = function (drone, processNumber) {
	var self = this;
	
	var now = Date.now()
	var logLoc = config.droneLocation + drone.user._id + "/logs/" + drone._id + "." + now + ".";
	
	var log = logLoc + processNumber + ".log";
	
	drone.logs.push({
		created: now,
		location: log
	})
	drone.save(); //its being saved later, but it might not happen.
	
	// Add instances to proxy
	var env = {};
	env.NODE_ENV = 'production';
	for (var i = 0; i < drone.env.length; i++) {
		env[drone.env[i].name] = drone.env[i].value;
	}
	env.PORT = server.proxy.lastUsedPort++;
	
	proc = new (forever.Monitor)(drone.script, {
		max: 3,
		silent: process.env.NODE_ENV == 'production' ? true : false,
		minUptime: 500,
		sourceDir: drone.location,
		env: env, // Define app environment
		cwd: drone.location,
		killTree: true,
		outFile: log,
		errFile: log,
		spawnWith: {
			uid: drone.user.uid,
			gid: drone.user.gid
		}
	});

	self.processes.push(proc);

	server.proxy.addProcess(drone, proc, env.PORT);

	proc.on('exit', function(proc) {
		self.processExit(proc)
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
}

Process.prototype.killProcess = function () {
	var self = this;
	
	if (self.processes.length == 0) {
		console.log("No processes to kill.");
		return;
	}
	
	var process = self.processes.pop();
	
	if (process.running && process.child.pid) {
		process.stop();
		console.log("Process", process.uid, "Stopped");
	} else {
		console.log("Unable to stop process", process.uid)
	}
}

Process.prototype.stop = function () {
	var self = this;
	
	self.getDrone(function(drone) {
		console.log("Stopping")
		
		drone.isRunning = false;
		drone.isRestarting = false;
		drone.save();
		
		server.proxy.removeDrone(drone);
		
		if (self.processes.length > 0) {
			var procs = self.processes.length;
			for (var i = 0; i < procs; i++) {
				self.killProcess();
			}
			
			console.log("Stopped with proc");
		} else {
			console.log("No Processes to stop")
		}
	})
}

Process.prototype.restart = function () {
	var self = this;
	
	self.getDrone(function(drone) {
		console.log("Restarting")
	
		if (self.proc) {
			var env = self.proc._env;
			env.NODE_ENV = 'production';
			for (var i = 0; i < drone.env.length; i++) {
				env[drone.env[i].name] = drone.env[i].value;
			}
			server.proxy.updatePort(drone);
			env.PORT = drone.port;
			
			var now = Date.now()
			var logLoc = config.droneLocation + drone.user._id + "/logs/" + drone._id + "." + now + ".log";
			drone.logs.push({
				created: now,
				location: logLoc
			})
			self.proc.outFile = logLoc;
			self.proc.errFile = logLoc;
			
			drone.isRestarting = true;
			drone.save(function(err) {
				if (err) throw err;
				
				self.proc.restart();
			});
			
			console.log("Restarted")
		} else {
			console.log("Cannot restart, stopping")
			self.stop()
		}
	})
}
