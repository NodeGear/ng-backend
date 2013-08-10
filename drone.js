var fs = require('fs')
	, async = require('async')
	, repositories = require('./repositories')
	, exec = require('child_process').exec
	, npm = require('npm')
	, forever = require('forever-monitor')

function Drone (opts, cb) {
	this.repo = null;
	this.location = __dirname + "/apps/";
	this.pkg = null;
	this.opts = opts;
	this.cb = cb;
	this.self = this;
	this.repository;
	this.spawn = null
	
	this.init()
};

Drone.prototype.init = function () {
	var self = this;
	if (this.opts.repository.type == "local") {
		this.repository = repositories.local;
	}
	
	this.repository.init(this);
}

Drone.prototype.validatePackage = function () {
	//TODO Do lots of this.pkg validation crap
	
	this.location += this.pkg.name;
	
	return true;
}

Drone.prototype.start = function (cb) {
	var self = this;
	console.log(self.pkg)
	var proc = new (forever.Monitor)(self.pkg.start, {
		max: 3,
		minUptime: 2000,
		sourceDir: self.location,
		env: { NODE_ENV: 'production', PORT: 3001 },
		cwd: self.location,
		killTree: true
		// TODO logs
	});
	
	proc.on('error', function(err) {
		console.log(err);
	});
	proc.on('start', function(proc, data) {
		console.log("Started")
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
	});
	proc.on('restart', function(proc) {
		console.log("Restarted")
	});
	proc.on('stdout', function(data) {
		console.log("OUT: "+data)
	});
	proc.on('stderr', function(data) {
		console.log("ERR: "+data);
	})
	
	proc.start();
}

Drone.prototype.install = function (cb) {
	var self = this;
	
	exec('cd '+ this.location +' && npm install', function(err) {
		cb(err);
	})
	/*
	loadNPM(function() {
		console.log("Installing NPM to "+self.location)
		npm.commands.install(self.location, self.pkg.dependencies, function(err) {
			if (err) throw err;
			
			console.log("Installed successfully");
			cb(err);
		})
	})not working*/ 
}

Drone.prototype.copy = function(cb) {
	var self = this;
	
	exec('rm -rf ' + this.location, function(err) {
		if (err) throw err;
		
		console.log('cp -r ' + self.opts.repository.path + ' ' + self.location)
		exec('cp -r ' + self.opts.repository.path + ' ' + self.location, function(err) {
			if (err) throw err;
			
			cb(err)
		})
	});
}

function loadNPM(cb) {
	npm.load({}, function (err) {
		if (err) throw err;
		console.log("NPM loaded")
		cb()
	})
}

module.exports = Drone;