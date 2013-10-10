var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, fs = require('fs.extra')
	, async = require('async')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, cloud = require('../cloud').app
	, config = require('../config')

var droneSchema = schema({
	name: String,
	pkg: {},
	user: {
		type: ObjectId,
		ref: "User"
	},
	location: String,
	isRunning: Boolean,
	isInstalled: { type: Boolean, default: false },
	installedOn: String // label of the nodecloud instance looking after this drone
})

droneSchema.methods.start = function () {
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
	});
	proc.on('start', function(proc, data) {
		console.log("Started")
		console.log(data.toString());
		console.log("Drone started")
		
		self.isRunning = true;
		self.save();
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
		
		self.isRunning = false;
		self.save();
	});
	proc.on('restart', function(proc) {
		console.log("Restarted")
	});
	proc.on('stdout', function(data) {
		console.log("STD::OUT: ");
		//console.log(data.toString());
	});
	proc.on('stderr', function(data) {
		console.log("STD::ERR: ")
		console.log(data.toString());
	})
	
	// Start the process
	proc.start();
}

droneSchema.methods.stop = function () {
	// todo proxy.removeProxy drone
	if (this.proc) {
		// Thermonuclear shutdown
		this.proc.stop();
		
		// TODO cloud.processes.splice(proc)
		self.isRunning = false;
		self.save();
	}
}

droneSchema.methods.restart = function () {
	if (this.proc) {
		this.proc.restart();
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