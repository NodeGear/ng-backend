var fs = require('fs')
	, async = require('async')
	, repositories = require('./repositories')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, deps = require('./dependencies')

function Drone (opts, cb) {
	this.cloud = require('../cloud')
	this.repo = null;
	this.pkg = opts.pkg;
	this.user = opts.user;
	this.location = "/var/cloudapps/"+this.user.username+"/"+this.pkg.name+"/";
	this.opts = opts;
	this.cb = cb;
	this.self = this;
	this.repository;
	this.spawn = null;
	this.proc = null;
	
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
	
	console.log(this.pkg);
	
	if (this.pkg.subdomain.length != 0) {
		this.pkg.subdomain += ".nodecloud.matej.me";
	}
	
	return true;
}

Drone.prototype.start = function (cb) {
	var self = this;
	console.log(self.pkg)
	this.proc = proc = new (forever.Monitor)(self.pkg.start, {
		max: 3,
		minUptime: 2000,
		sourceDir: self.location,
		env: { NODE_ENV: 'production', PORT: self.port },
		cwd: self.location,
		killTree: true
		// TODO logs
	});
	
	proc.on('error', function(err) {
		console.log(err);
		self.cloud.emit("drone:error", self, err)
	});
	proc.on('start', function(proc, data) {
		console.log("Started")
		self.cloud.emit("drone:start", self, data)
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
		self.cloud.emit("drone:stop", self)
	});
	proc.on('restart', function(proc) {
		console.log("Restarted")
		self.cloud.emit("drone:restart", self)
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
	
	exec('rm -rf '+self.location+'; mkdir -p '+self.location+'; cp -r ' + self.opts.repository.path + ' ' + self.location, function(err) {
		if (err) throw err;
		
		cb(err)
	})
}
Drone.prototype.installDependencies = function (cb) {
	deps.install(this, cb);
}

module.exports = Drone;