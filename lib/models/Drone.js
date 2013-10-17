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
	, npm = require('npm')

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
	pid: Number,
	logs: [{
		created: Date,
		location: String
	}]
})

droneSchema.methods.installDependencies = function (cb) {
	var self = this;
	
	fs.readFile(self.location+"package.json", function(err, json) {
		try {
			var pkg = JSON.parse(json);
			
			if (pkg.dependencies == null) {
				cb(null)
				return;
			}
			
			console.log("Installing npm dependencies..");
			var deps = Object.keys(pkg.dependencies)
			npm.load({
				_exit: false,
				exit: false,
				'unsafe-perm': true,
				loglevel: "silent",
				production: true
			}, function(err) {
				if (err) throw err;
				
				npm.commands.install(self.location, deps, function(err) {
					if (err) throw err;
					
					cb(null);
				})
			})
		} catch (ex) {
			cb("Malformed package.json")
		}
	});
}

droneSchema.methods.parsePackage = function (cb) {
	if (!cb) cb = function() {}
	var self = this;
	
	fs.exists(self.location+"package.json", function(exists) {
		if (exists) {
			fs.readFile(self.location+"package.json", function(err, json) {
				try {
					var pkg = JSON.parse(json);
					
					self.pkg = {
						name: pkg.name,
						version: pkg.version,
						start: pkg.start,
						subdomain: pkg.subdomain,
						domains: pkg.domains
					};
					
					self.save(function(err) {
						if (err) throw err;
						
						cb(null)
					})
				} catch (ex) {
					cb("package.json malformed!")
				}
			})
		} else {
			cb("package.json does not exist!");
		}
	})
}

droneSchema.methods.start = function () {
	var self = this;
	
	// Start a forever process
	cloud.app.proxy.proxyDrone(self); // TODO assign drone
	
	var now = Date.now()
	var logLoc = config.droneLocation + self._id + "." + now + ".log";
	self.logs.push({
		created: now,
		location: logLoc
	})
	self.save(); //its being saved later, but it might not happen.
	
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
	} else {
		console.log("Cannot restart, stopping")
		self.stop()
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