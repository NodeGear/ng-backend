var fs = require('fs')
	, async = require('async')
	, repositories = require('./repositories')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, deps = require('./dependencies')

var port = 8050;
function Drone (opts, cb) {
	this.repo = null;
	this.location = "/var/cloudapps/";
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
		env: { NODE_ENV: 'production', PORT: port++ },
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
	
	cb(proc);
}

// Installs the app directory into its space
Drone.prototype.install = function(cb) {
	var self = this;
	
	exec('rm -rf '+self.location+'; cp -r ' + self.opts.repository.path + ' ' + self.location, function(err) {
		if (err) throw err;
		
		cb(err)
	})
}
Drone.prototype.installDependencies = function (cb) {
	deps.install(this, cb);
}

module.exports = Drone;