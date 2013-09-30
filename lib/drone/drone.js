var fs = require('fs.extra')
	, async = require('async')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, deps = require('./dependencies')
	, cloud = require('../cloud')
	, config = require('../config')
	, Model = require('./model')

function Drone (opts, cb) {
	// Save options & callback
	this.opts = opts;
	
	// Package.json
	this.pkg = opts.pkg;
	
	// Drone running?
	this.running = false;
	
	if (opts.model == null) {
		// Drone location
		this.location = config.droneLocation + this.user.username + "/" + this.pkg.name + "/";
		
		// Save the model into the db.
		this.model = new Model({
			pkg: opts.pkg,
			user: opts.user._id,
			location: this.location,
			isRunning: false
		});
		// save
		this.model.save(function(err) {
			if (err) throw err;
		})
		
		
	} else {
		this.model = opts.model;
		this.location = opts.model.location;
		this.pkg = opts.model.pkg;
		this.user = opts.model.user; // must be mongoose-populated!
		this.running = opts.model.running;
	}
};

Drone.prototype.start = function (cb) {
	var self = this;
	
	// Start a forever process
	this.proc = proc = new (forever.Monitor)(self.pkg.start, {
		max: 3,
		minUptime: 2000,
		sourceDir: self.location,
		env: { NODE_ENV: 'production', PORT: self.port }, // Define app environment
		cwd: self.location,
		killTree: true
		// TODO logs
	});
	
	proc.on('error', function(err) {
		console.log("Error:");
		console.log(err);
		//cloud.emit("drone:error", self, err)
		console.log(err);
	});
	proc.on('start', function(proc, data) {
		console.log("Started")
		console.log(data);
		console.log("Drone started")
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
		console.log("Drone stopped");
	});
	proc.on('restart', function(proc) {
		console.log("Restarted")
		console.log("Drone restarted");
	});
	proc.on('stdout', function(data) {
		console.log("OUT: ");
		console.log(data);
	});
	proc.on('stderr', function(data) {
		console.log("ERR: ")
		console.log(data);
	})
	
	// Start the process
	proc.start();
	
	self.model.isRunning = true;
	self.model.save(function(err) {
		if (err) throw err;
	});
	
	cloud.processes.push({
		drone: self,
		process: proc
	})
	
	// call Callback
	cb(proc);
}

Drone.prototype.stop = function (cb) {
	if (this.proc) {
		// Thermonuclear shutdown
		this.proc.stop();
		
		this.model.isRunning = false;
		this.model.save(function(err) {
			if (err) throw err;
		});
		
		// TODO cloud.processes.splice(proc)
		
		cb(true);
	} else {
		cb(false);
	}
}

Drone.prototype.restart = function (cb) {
	if (this.proc) {
		this.proc.restart();
		cb(true)
	} else {
		cb(false);
	}
}

module.exports = Drone;