var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, fs = require('fs.extra')
	, async = require('async')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, backend = require('./backend')
	, config = require('./config')
	, usage = require('usage')
	, npm = require('npm')
	, models = require('ng-models')

var processes = [];

var Process = function(app_process) {
	this.app_id = app_process.app;
	this._id = app_process._id;

	this.current_log = null;
}

exports.fetchProcesses = function() {
};

exports.get_processes = function() {
	return processes;
}

exports.manageProcess = function(app_process) {
	if (typeof proc === 'undefined') {
		proc = null;
	}
	
	var process = exports.getProcess(app_process);
	if (process) return process;
	
	process = new Process(app_process);
	processes.push(process)
	
	return process;
}

exports.getProcess = function (app_process) {
	for (var i = 0; i < processes.length; i++) {
		if (processes[i]._id.equals(app_process._id)) {
			// Already managing it
			return processes[i];
		}
	}
	
	return null;
}

Process.prototype.getApp = function (cb) {
	var self = this;
	
	models.App.findById(self.app_id).populate('user').exec(function(err, app) {
		if (err || !app) {
			return cb(null);
		}
		
		cb(app);
	});
}

Process.prototype.getProcess = function (cb) {
	var self = this;

	models.AppProcess.findById(self._id).exec(function(err, app_process) {
		if (err || !app_process) {
			return cb(null);
		}

		cb(app_process);
	})
}

Process.prototype.processExit = function(proc) {
	var self = this;
	
	self.getApp(function(drone) {
		// Cannot Start process
		console.log("Process died")
		
		// Remove process from heap
		for (var i = 0; i < self.processes.length; i++) {
			if (self.processes[i].uid == proc.uid) {
				// TODO Warning, this process did exit and was not caused by scale action or stop action!
				
				self.processes.splice(i, 1);
				break;
			}
		}
		
		// Remove process from proxy
		backend.proxy.removeProcess(drone, proc);
		
		if (drone.isRunning == true && self.processes.length == 0) {
			// was not paused intentionally, a crash.
			// No more processes running, email user.
			drone.isRunning = false;
			drone.isRestarting = false;
			drone.save();
			
			Drone.AddEvent(drone._id, "Shut Down", "Life of process unsustainable. Please refer to logs for more information")
			drone.user.notifyUser("[DOWN] "+drone.name, "Your Drone "+drone.name+" has gone permanently down. stack trace: abcd. Resurrect in your admin console.<br/><br/>Have a nais day")
		}
		
		if (self.processes.length == 0) {
			// Remove drone from proxy
			backend.proxy.removeDrone(drone);
		}
	})
}

Process.prototype.processStart = function(proc, data) {
	var self = this;
	
	self.getProcess(function(app_process) {
		console.log("Started")
		console.log("Drone started")
		
		models.AppEvent.AddEvent(self._id, self.app_id, "Start", "Process has been Started")
		
		backend.proxy.updatePid(app_process, proc);
		
		app_process.running = true;
		app_process.save();
	});
}

Process.prototype.processStop = function(proc) {
	var self = this;
	
	self.getApp(function(drone) {
		if (drone.isRestarting) {
			console.log("Stop event, doing nothing.")
			return;
		}
		
		console.log("Process stopped")
		
		Drone.AddEvent(drone._id, "Stop", "Process Stopped")
		
		backend.proxy.removeProcess(drone, proc);
	});
}

Process.prototype.processRestart = function(proc) {
	var self = this;
	
	self.getApp(function(drone) {
		console.log("Process Restarted")
		
		Drone.AddEvent(drone._id, "Restart", "Process restarted")
		
		drone.isRestarting = false;
		
		backend.proxy.updatePid(drone, proc);
		backend.proxy.updateDrone(drone, function() {
			drone.isRunning = true;
			
			drone.save()
		})
	});
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

Process.prototype.launchProcess = function (cb) {
	var self = this;

	self.getApp(function(app) {
		var now = Date.now()
		//logLoc = config.droneLocation + drone.user._id + "/logs/" + drone._id + "." + now + ".";
		
		var log = "/tmp/"+self._id+now+'.log';
		
		var logModel = new models.AppLog({
			created: now,
			location: log,
			app: self.app_id,
			process: self._id
		});

		logModel.save();
		
		// Add instances to proxy
		var env = {};
		env.NODE_ENV = 'production';
		//for (var i = 0; i < drone.env.length; i++) {
		//	env[drone.env[i].name] = drone.env[i].value;
		//}
		env.PORT = backend.proxy.lastUsedPort++;
		
		proc = new (forever.Monitor)(app.script, {
			max: 1,
			silent: process.env.NODE_ENV == 'production' ? true : false,
			minUptime: 500,
			sourceDir: "/tmp/"+app.location,
			env: env, // Define app environment
			cwd: "/tmp/"+app.location,
			killTree: true,
			outFile: log,
			errFile: log,
			//spawnWith: {
			//	uid: drone.user.uid,
			//	gid: drone.user.gid
			//}
		});

		self.process = proc;

		backend.proxy.addProcess(self, proc, env.PORT);

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
		
		// Start the process
		proc.start();

		cb()
	});
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

Process.prototype.start = function () {
	var self = this;
	
	console.log("Starting :)")
	
	self.getApp(function(drone) {
		// Start a forever process
		
		if (!drone.script) {
			console.log("No Way to Start Application!");
			return;
		}
		
		// Proxy the drone
		backend.proxy.proxyDrone(drone);
		
		drone.isRestarting = false;
		
		self.scale(drone, drone.processes);
	})
}

Process.prototype.stop = function () {
	var self = this;
	
	self.getApp(function(drone) {
		console.log("Stopping")
		
		drone.isRunning = false;
		drone.isRestarting = false;
		drone.save();
		
		backend.proxy.removeDrone(drone);
		
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
	
	self.getApp(function(drone) {
		console.log("Restarting")
	
		if (self.processes.length == 0) {
			console.log("Cannot restart, stopping");
			self.stop();
			
			return;
		}
		
		var now = Date.now()
		
		for (var i = 0; i < self.processes.length; i++) {
			var env = self.processes[i]._env;
			env.NODE_ENV = 'production';
			for (var x = 0; x < drone.env.length; x++) {
				env[drone.env[x].name] = drone.env[x].value;
			}
			
			backend.proxy.removeProcess(drone, self.processes[i]);
			
			var port = backend.proxy.lastUsedPort++;
			backend.proxy.addProcess(drone, self.processes[i], port);
			env.PORT = port;
			
			var log = config.droneLocation + drone.user._id + "/logs/" + drone._id + "." + now + "." + i + ".log";
			drone.logs.push({
				created: now,
				location: log
			})
			self.processes[i].outFile = log;
			self.processes[i].errFile = log;
		}
		
		drone.isRestarting = true;
		drone.save(function(err) {
			if (err) throw err;
			
			for (var i = 0; i < self.processes.length; i++) {
				self.processes[i].restart();
			}
			
			self.scale(drone, drone.processes)
		});
		
		console.log("Restarted")
	})
}
