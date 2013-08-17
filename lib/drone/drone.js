var fs = require('fs')
	, async = require('async')
	, repositories = require('./repositories')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, deps = require('./dependencies')

function Drone (opts, cb) {
	this.cloud = require('../cloud');
	this.cloud.drones.push(this);
	this.repo = null;
	this.pkg = opts.pkg;
	this.user = opts.user;
	this.location = "/Users/matejkramny/cloudapps/"+this.user.username+"/"+this.pkg.name+"/";
	this.opts = opts;
	this.cb = cb;
	this.self = this;
	this.repository;
	this.spawn = null;
	this.proc = null;
	this.connection = opts.connection;
	
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
	
	if (this.pkg.subdomain.length != 0) {
		this.pkg.subdomain += ".nodecloud.matej.me";
	}
	
	return true;
}

Drone.prototype.start = function (cb) {
	var self = this;
	
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
			.emit("drone:data", self, err)
	});
	proc.on('start', function(proc, data) {
		console.log("Started")
		self.cloud.emit("drone:start", self, data)
			.emit("drone:data", self, data)
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
		self.cloud.emit("drone:stop", self)
			.emit("drone:data", self, "Drone stopped")
	});
	proc.on('restart', function(proc) {
		console.log("Restarted")
		self.cloud.emit("drone:restart", self)
			.emit("drone:data", self, "Drone restarted")
	});
	proc.on('stdout', function(data) {
		console.log("OUT: "+data)
		self.cloud.emit("drone:data", self, data)
	});
	proc.on('stderr', function(data) {
		console.log("ERR: "+data);
		self.cloud.emit("drone:data", self, data)
	})
	
	proc.start();
	
	cb(proc);
}

// Installs the app directory into its space
Drone.prototype.install = function(cb) {
	var self = this;
	
	exec('rm -rf '+self.location+'; mkdir -p '+self.location+'; cp -r ' + self.opts.repository.path + ' ' + self.location, function(err) {
		if (err) {
			self.cloud.emit('drone:data', self, "500 Server error");
			throw err;
		}
		
		cb(err)
	})
}

Drone.prototype.installDependencies = function (cb) {
	this.cloud.emit('drone:data', this, "Installing dependencies")
	deps.install(this, cb);
}

module.exports = Drone;