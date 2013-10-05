var fs = require('fs.extra')
	, async = require('async')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, cloud = require('../cloud').app
	, config = require('../config')

function Drone (model) {
	this.model = model;
	
	// Package.json
	this.pkg = model.pkg;
	
	// Drone running?
	this.running = false;
	
	// Drone location
	this.location = config.droneLocation + "/" + this.pkg.name + "/";
};

Drone.prototype.start = function () {
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
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
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

Drone.prototype.stop = function () {
	if (this.proc) {
		// Thermonuclear shutdown
		this.proc.stop();
		
		// TODO cloud.processes.splice(proc)
	}
}

Drone.prototype.restart = function () {
	if (this.proc) {
		this.proc.restart();
	}
}

exports.Drone = Drone;