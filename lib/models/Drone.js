var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, fs = require('fs.extra')
	, async = require('async')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, server = require('../server')
	, config = require('../config')
	, usage = require('usage')
	, npm = require('npm')
	, Event = require('./Event')

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
	}],
	env: [{
		name: String,
		value: String,
		created: { type: Date, default: Date.now() },
	}],
	events: [{
		type: ObjectId,
		ref: 'Event'
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
	server.proxy.proxyDrone(self); // TODO assign drone
	
	var now = Date.now()
	var logLoc = config.droneLocation + self._id + "." + now + ".log";
	
	var event = new Event({
		name: "Started",
		message: "App was started"
	})
	event.save();
	
	self.events.push(event._id)
	
	self.logs.push({
		created: now,
		location: logLoc
	})
	self.save(); //its being saved later, but it might not happen.
	
	var env = {};
	env.NODE_ENV = 'production';
	for (var i = 0; i < self.env.length; i++) {
		env[self.env[i].name] = self.env[i].value;
	}
	env.PORT = self.port;
	
	this.proc = proc = new (forever.Monitor)(self.pkg.start, {
		max: 3,
		silent: process.env.NODE_ENV == 'production' ? true : false,
		minUptime: 500,
		sourceDir: self.location,
		env: env, // Define app environment
		cwd: self.location,
		killTree: true,
		outFile: logLoc,
		errFile: logLoc,
		spawnWith: {
			uid: self.user.uid
		}
	});
	
	proc.on('error', function(err) {
		console.log("Error:");
		//console.log(err);
	});
	proc.on('exit', function() {
		// Cannot Start process
		console.log("Process permanently dead")
		server.proxy.removeDrone(self)
		
		if (self.isRunning == true) {
			// was paused intentionally, not a crash.
			self.user.notifyUser("[DOWN] "+self.name, "Your Drone "+self.name+" has gone permanently down. stack trace: abcd. Resurrect in your admin console.<br/><br/>Have a nais day")
		}
		
		self.isRunning = false;
		self.save();
	})
	proc.on('start', function(proc, data) {
		console.log("Started")
		console.log(data.toString());
		console.log("Drone started")
		
		var pid = proc.child.pid;
		self.pid = pid;
		
		self.isRunning = true;
		self.save();
		
		server.proxy.updatePid(self);
	});
	proc.on('stop', function(proc) {
		console.log("Process stopped")
		
		self.isRunning = false;
		self.save();
		
		server.proxy.removeDrone(self)
	});
	proc.on('restart', function(proc) {
		console.log("Process Restarted")
		
		var pid = proc.child.pid;
		self.pid = pid;
		
		server.proxy.updatePid(self);
		
		self.isRunning = true;
		self.save();
		
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
	
	var event = new Event({
		name: "Stopped",
		message: "App was stopped"
	})
	event.save();
	
	self.events.push(event._id)
	self.save()
	
	console.log(self);
	
	// TODO server.processes.splice(proc)
	self.isRunning = false;
	self.save();
	
	if (this.proc) {
		this.proc.stop();
		console.log("Stopped with proc");
	} else {
		console.log("Force-stop pid")
		
		if (!this.pid) {
			console.log("No PID. WTF?");
			return;
		}
		
		forever.kill(this.pid, true, 'SIGKILL', function() {
			console.log("Stopped using force")
		})
	}
}

droneSchema.methods.restart = function () {
	var self = this;
	
	// TODO weird proxy behaviour..
	console.log("Restarting")
	
	var event = new Event({
		name: "Restarted",
		message: "App was restarted"
	})
	event.save();
	
	self.events.push(event._id)
	self.save()
	
	if (this.proc) {
		this.proc.restart();
		console.log("Restarted")
	} else {
		console.log("Cannot restart, stopping")
		self.stop()
	}
}

module.exports = mongoose.model("Drone", droneSchema);