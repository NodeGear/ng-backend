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
	, client = backend.redis_client

var processes = [];
var proxy_from_port = config.proxyStartPort;

var Process = function(app_process) {
	this.app_id = app_process.app;
	this._id = app_process._id;

	this.process = null;
	this.restart_process = false;
	this.current_log = null;

	this.intended_stop = false;
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

// Process events.
Process.prototype.processExit = function() {
	var self = this;
	
	console.log("Process Died");

	self.process = null;
	self.restart_process = false;
	
	self.removeFromProxy();

	if (!self.intended_stop) {
		// was not paused intentionally, a crash.
		// No more processes running, email user.
		console.log("##### Unintentional crash!");
		models.AppEvent.AddEvent(self._id, self.app_id, "Shut Down", "Life of process unsustainable. Please refer to logs for more information");
	}

	self.getProcess(function(app_process) {
		app_process.running = false;
		app_process.save();
	})
}

// Process was Started
Process.prototype.processStart = function(proc, data) {
	var self = this;
	
	console.log("Started")
	console.log("App Process was Started")

	self.intended_stop = false;
	models.AppEvent.AddEvent(self._id, self.app_id, "Start", "Process has been Started")

	self.addToProxy();

	self.getProcess(function(app_process) {
		app_process.running = true;
		app_process.save();
	});
}

// Process was Stopped
Process.prototype.processStop = function(proc) {
	var self = this;
	
	if (self.isRestarting) {
		console.log("Stop event, doing nothing.")
		return;
	}

	self.removeFromProxy();

	console.log("Process was Stopped")
	
	models.AppEvent.AddEvent(self._id, self.app_id, "Stop", "Process Stopped")

	self.getProcess(function(app_process) {
		app_process.running = false;
		app_process.save();
	});
}

// Process was Restarted
Process.prototype.processRestart = function() {
	var self = this;
	
	console.log("Process Restarted")
	
	models.AppEvent.AddEvent(self._id, self.app_id, "Restart", "Process restarted")
	
	self.restart_process = false;

	self.getProcess(function(app_process) {
		app_process.running = true;
		app_process.save();
	});
}

// Boot the process
Process.prototype.launchProcess = function (cb) {
	if (typeof cb === 'undefined') cb = function() {};

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
		
		var env = {};
		env.NODE_ENV = 'development';
		//for (var i = 0; i < drone.env.length; i++) {
		//	env[drone.env[i].name] = drone.env[i].value;
		//}

		// TODO get port from redis
		env.PORT = proxy_from_port++;// = backend.proxy.lastUsedPort++;
		self.port = env.PORT;

		proc = new (forever.Monitor)(app.script, {
			max: 1,
			silent: process.env.NODE_ENV == 'production' ? true : false,
			minUptime: 500,
			sourceDir: "/Users/matejkramny/Developer/"+app.location,
			env: env, // Define app environment
			cwd: "/Users/matejkramny/Developer/"+app.location,
			killTree: true,
			outFile: log,
			errFile: log,
			//spawnWith: {
			//	uid: drone.user.uid,
			//	gid: drone.user.gid
			//}
		});
		
		self.process = proc;

		proc.on('exit', function() {
			self.processExit()
		});
		proc.on('start', function(proc, data) {
			self.processStart(proc, data)
		});
		proc.on('stop', function(proc) {
			self.processStop(proc)
		});
		proc.on('restart', function() {
			self.processRestart()
		});
		
		// Start the process
		proc.start();

		cb();
	});
}

// Start a process
Process.prototype.start = function (cb) {
	if (typeof cb === 'undefined') cb = function() {};

	var self = this;
	
	console.log("Starting a process", {
		app: self.app_id,
		process: self._id
	});
	
	self.restart_process = false;
	self.intended_stop = false;
	self.launchProcess(cb);
}

// Stop a process
Process.prototype.stop = function (cb) {
	if (typeof cb === 'undefined') cb = function() {};

	var self = this;
	
	console.log("Stopping")
	self.restart_process = false;
	self.intended_stop = true;
	
	if (self.process.running && self.process.child.pid) {
		self.process.stop();
		console.log("Process", self.process.uid, "Stopped");
	} else {
		console.log("Unable to stop process", process.uid)
	}

	cb();
}

Process.prototype.addToProxy = function() {
	var self = this;

	client.hmset('proxy:domains', {
		"localhost": self.app_id
	}, function(err) {
		if (err) throw err;
	});

	client.sadd('proxy:app_'+self.app_id, self._id);

	client.hmset('proxy:app_process_'+self._id, {
		hostname: backend.server.location,
		port: self.port
	}, function(err) {
		if (err) throw err;
	});
}

Process.prototype.removeFromProxy = function() {
	var self = this;

	client.srem('proxy:app_'+self.app_id, self._id);
	client.del('proxy:app_process_'+self._id)
}