var fs = require('fs.extra')
	, async = require('async')
	, repositories = require('./repositories')
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
	// Username
	this.user = opts.user;
	
	// Websocket of the client
	this.io = opts.io;
	// Connection
	this.connection = opts.connection;
	
	// Drone running?
	this.running = false;
	
	if (!opts.model) {
		// Drone location
		this.location = config.droneLocation + this.user.username + "/" + this.pkg.name + "/";
		
		// Define repository
		if (this.opts.repository.type == "local") {
			this.repository = repositories.local;
		}
		
		this.model = new Model({
			pkg: opts.pkg,
			user: opts.user._id,
			location: this.location,
			running: false
		})
		this.model.save(function(err) {
			if (err) throw err;
		})
	
		// Init the repository
		this.repository.init(this);
	} else {
		this.model = opts.model;
		this.location = opts.model.location;
		this.pkg = opts.model.pkg;
		this.user = opts.model.user; // must be mongoose-populated!
		this.running = opts.model.running;
		cloud.emit("drone:create", this)
	}
};

Drone.prototype.validatePackage = function () {
	//TODO Do lots of this.pkg validation crap
	
	// Append subdomain location of this server..
	if (this.pkg.subdomain.length != 0) {
		this.pkg.subdomain += "." + config.api;
	}
	
	// True, this package is VALID (false it isn't..)
	return true;
}

Drone.prototype.start = function (cb) {
	var self = this;
	
	// Start this drone.
	
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
		console.log(err);
		cloud.emit("drone:error", self, err)
		self.log(err);
	});
	proc.on('start', function(proc, data) {
		console.log("Started")
		
		cloud.emit("drone:start", self, data)
		self.log("Drone started")
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
		cloud.emit("drone:stop", self)
		self.log("Drone stopped");
	});
	proc.on('restart', function(proc) {
		console.log("Restarted")
		cloud.emit("drone:restart", self)
		self.log("Drone restarted");
	});
	proc.on('stdout', function(data) {
		console.log("OUT: "+data)
		self.log(data);
	});
	proc.on('stderr', function(data) {
		console.log("ERR: "+data);
		self.log(data);
	})
	
	// Start the process
	proc.start();
	
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

// Installs the app directory into its space
Drone.prototype.install = function(cb) {
	var self = this;
	
	async.series([
		function(cb) {
			// Remove the repository (if exists)
			fs.rmrf(self.location, cb)
		},
		function(cb) {
			// mkdir -p the location
			fs.mkdirp(self.location, cb)
		},
		function(cb) {
			// Copy the temporary repository location into new location
			fs.copyRecursive(self.opts.repository.path, self.location, cb)
		},
		function(cb) {
			self.installDependencies(function(err) {
				console.log("Installed")
				self.log("Installed dependencies")
				cb(err);
			})
		}
	], function(err) {
		if (err) {
			self.log("500 Server error");
			throw err;
		}
		
		cb()
	});
}

Drone.prototype.installDependencies = function (cb) {
	// Installs NPM packages
	this.log("Installing dependencies")
	deps.install(this, cb);
}

Drone.prototype.log = function (data) {
	console.log("typeof data "+typeof data)
	if (this.io) {
		this.io.emit('dronedata', data.toString())
	}
}

module.exports = Drone;