var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, fs = require('fs.extra')
	, async = require('async')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, cloud = require('../cloud')
	, config = require('../config')
	, usage = require('usage')

var droneSchema = schema({
	name: String,
	pkg: {},
	user: {
		type: ObjectId,
		ref: "User"
	},
	deleted: { type: Boolean, default: false },
	location: String,
	isRunning: Boolean,
	isInstalled: { type: Boolean, default: false },
	installedOn: String, // label of the nodecloud instance looking after this drone
	pid: Number
})

droneSchema.methods.start = function () {
	var self = this;
	
	// Start a forever process
	cloud.app.proxy.proxyDrone(self); // TODO assign drone
	
	var logLoc = config.droneLocation + self._id + ".log";
	// TODO log rotation!.
	this.proc = proc = new (forever.Monitor)(self.pkg.start, {
		max: 3,
		minUptime: 2000,
		sourceDir: self.location,
		env: { NODE_ENV: process.env.NODE_ENV, PORT: self.port }, // Define app environment
		cwd: self.location,
		killTree: true,
		outFile: logLoc,
		errFile: logLoc
	});
	
	proc.on('error', function(err) {
		console.log("Error:");
		//console.log(err);
	});
	proc.on('start', function(proc, data) {
		console.log("Started")
		console.log(data.toString());
		console.log("Drone started")
		
		var pid = proc.child.pid;
		self.pid = pid;
		
		self.isRunning = true;
		self.save();
		
		cloud.app.proxy.updatePid(self);
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
		
		self.isRunning = false;
		self.save();
		
		cloud.app.proxy.removeDrone(self)
	});
	proc.on('restart', function(proc) {
		console.log("Restarted")
		
		var pid = proc.child.pid;
		self.pid = pid;
		
		cloud.app.proxy.updatePid(self);
		
		self.save()
	});
	proc.on('stdout', function(data) {
		//console.log("STD::OUT: ");
		//console.log(data.toString());
	});
	proc.on('stderr', function(data) {
		//console.log("STD::ERR: ")
		//console.log(data.toString());
	})
	
	// Start the process
	proc.start();
}

droneSchema.methods.stop = function () {
	var self = this;
	// todo proxy.removeProxy drone
	console.log("Stopping")
	
	console.log(self);
	
	if (this.proc) {
		this.proc.stop();
		console.log("Stopped with proc");
	} else {
		console.log("Force-stop pid")
		forever.kill(this.pid, true, 'SIGKILL', function() {
			// TODO cloud.processes.splice(proc)
			self.isRunning = false;
			self.save();
			
			console.log("Stopped using force")
		})
	}
}

droneSchema.methods.restart = function () {
	console.log("Restarting")
	if (this.proc) {
		this.proc.restart();
		console.log("Restarted")
	}
}

module.exports = mongoose.model("Drone", droneSchema);
/*
new module.exports({
	pkg: {
		"name": "Test-application",
		"version": "0.2.1",
		"start": "test.js",
		"subdomain": "testapp",
		"domains": [
			"testapp.matej.me"
		],
		"dependencies": {
		  "express":"*"
		}
	},
	location: config.droneLocation + "/testapp/",
	isRunning: true
}).save()*/