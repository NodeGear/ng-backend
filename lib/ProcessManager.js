var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, async = require('async')
	, exec = require('child_process').exec
	, spawn = require('child_process').spawn
	, forever = require('forever-monitor')
	, backend = require('./backend')
	, config = require('./config')
	, models = require('ng-models')
	, client = backend.redis_client
	, fs = require('fs')
	, httpRequest = require('./request').httpRequest;

var processes = [];
var proxy_from_port = 9000;

var stack = [
	'docker',
	'log',
	'node',
	'proxy',
	'uptime'
];

var Process = function(app_process) {
	this.app_id = app_process.app;
	this._id = app_process._id;

	this.restart_process = false;
	this.current_log = null;
	this.inserted_log_to_redis = false;

	// Storage is ephemeral
	this.app_location = null;
	this.intended_stop = false;

	this.running = false;
	this.starting = false;

	// Uptime report
	this.uptime = null;

	// Docker container id
	this.container = null;
}

exports.fetchProcesses = function() {
	console.log('Getting Previous processes');

	models.AppProcess.find({
		running: true,
		server: backend.server._id,
		containerID: {
			$ne: null
		}
	}).populate('app').exec(function (err, processes) {
		async.eachSeries(processes, function (dbProcess, cb) {
			var process = exports.getProcess(dbProcess._id);
			if (!process) {
				process = exports.manageProcess(dbProcess)
				process.app_id = dbProcess.app._id;
			}

			process.resurrectFromDead(dbProcess, cb);
		}, function (err) {
			console.log('Resurrected', processes.length, 'processes (hopefully)');
		});
	});
};

exports.get_processes = function() {
	return processes;
}
exports.getProcesses = exports.get_processes;

exports.manageProcess = function(app_process) {
	if (typeof proc === 'undefined') {
		proc = null;
	}
	
	var process = exports.getProcess(app_process);
	if (process) return process;
	
	process = new Process(app_process);
	processes.push(process)
	
	return process;
}

Process.prototype.unManageProcess = function() {
	var self = this;

	for (var i = 0; i < processes.length; i++) {
		if (processes[i]._id.equals(self._id)) {
			// Already managing it
			processes.splice(i, 1);
			return true;
		}
	}
	
	return false;
}

exports.getProcess = function (app_process) {
	for (var i = 0; i < processes.length; i++) {
		if (processes[i]._id.equals(app_process._id)) {
			// Already managing it
			return processes[i];
		}
	}
	
	return null;
}

exports.getProcessByContainer = function (container) {
	for (var i = 0; i < processes.length; i++) {
		if (processes[i].container == container) {
			return processes[i];
		}
	}
	
	return null;
}

Process.prototype.resurrectFromDead = function (dbProcess, cb) {
	var self = this;

	console.log('Resurrecting', dbProcess._id);

	this.inserted_log_to_redis = true;

	this.app_location = '/home/'+dbProcess.app.user+'/'+dbProcess._id;
	this.running = true;

	models.AppProcessUptime.findOne({
		sealed: false,
		user: dbProcess.app.user,
		app: dbProcess.app._id,
		process: dbProcess._id,
		server: backend.server._id
	}, function(err, uptime) {
		if (err) throw err;

		if (!uptime) {
			// never started.. forget this one
			self.unManageProcess();
			return cb();
		}

		self.uptime = uptime;

		client.lindex('pm:app_process_logs_'+dbProcess._id, 0, function(err, latest_log) {
			if (err) throw err;

			if (!latest_log) {
				// Never started..
				self.unManageProcess();
				return cb();
			}

			self.current_log = latest_log;

			self.container = dbProcess.containerID;

			// Get status
			var data = '';

			httpRequest()
			.get('/v1.13/containers/'+dbProcess.containerID+'/json')
			.onData(function (chunk) { data += chunk })
			.run(function (status) {
				if (status != 200) {
					// Not even running.. Turn this off.
					self.processExit();
					return cb();
				}

				try {
					var json = JSON.parse(data);
					if (json.State.Running != true) {
						// Not running.. Turn off.
						self.node_deleteContainer();
						self.processExit();
						return cb();
					}

					self.getDockerLogs(dbProcess.containerID);
					cb();
				} catch (e) {
					console.log('Error fetching container status', e);
					cb();
				}
			});
		});
	});
}

Process.prototype.getApp = function (cb) {
	var self = this;
	
	models.App.findById(self.app_id).populate('user').exec(function(err, app) {
		if (err || !app) {
			return cb(null);
		}
		
		cb(app);
	});
}
Process.prototype.getProcess = function (cb) {
	var self = this;

	models.AppProcess.findById(self._id).exec(function(err, app_process) {
		if (err || !app_process) {
			return cb(null);
		}

		cb(app_process);
	})
}

// Boot the process
Process.prototype.launchProcess = function (cb) {
	if (typeof cb === 'undefined') cb = function() {};

	var self = this;

	var now = Date.now();
	self.start_time = now;
	self.inserted_log_to_redis = false;

	async.parallel({
		app: function(done) {
			models.App.findOne({
				_id: self.app_id
			}).select('branch script user location app_type docker').exec(done);
		},
		environment: self.getEnvironment.bind(self)
	}, function(err, results) {
		if (err) throw err;

		// Log 'file' -- redis db.
		self.current_log = self._id+'_'+self.start_time;

		self.app_type = results.app.app_type;

		if (self.app_type == 'node') {
			self.launchNode(results);
		} else if (self.app_type == 'docker') {
			self.launchDocker(results);
		}
	});
}

// Start a process
Process.prototype.start = function (cb) {
	if (typeof cb === 'undefined') cb = function() {};

	var self = this;

	if (self.running) {
		console.log("Already Running!");
		models.AppEvent.AddEvent(self._id, self.app_id, "Already Running", "App is Already Running");
		return;
	}
	if (self.starting) {
		console.log("Cannot process > 1 action!");
		models.AppEvent.AddEvent(self._id, self.app_id, "Process Busy", "We're processing an event. Please wait for this to finish.");
		return;
	}

	self.starting = true;
	
	console.log("Starting a process", {
		app: self.app_id,
		process: self._id
	});

	models.AppEvent.AddEvent(self._id, self.app_id, "Starting", "App is Starting");
	
	self.restart_process = false;
	self.intended_stop = false;
	self.launchProcess(cb);
}

// Stop a process
Process.prototype.stop = function () {
	var self = this;
	
	console.log("Stopping")

	if (self.starting) {
		console.log("Cannot process > 1 action!");
		models.AppEvent.AddEvent(self._id, self.app_id, "Process Busy", "We're processing an event. Please wait for this to finish.");
		return;
	}

	self.restart_process = false;
	self.intended_stop = true;
	self.starting = true;

	models.AppEvent.AddEvent(self._id, self.app_id, "Stopping", "App is Stopping");
	
	if (self.container) {
		console.log("Process", self.container, "Stopped");
		
		self.node_stopContainer();

		return true;
	} else {
		models.AppProcess.update({
			_id: self._id
		}, {
			$set: {
				running: false
			}
		}, function(err) {
			if (err) throw err;
		});

		backend.bus.emit('app:stop', {
			app: self.app_id,
			process: self._id
		});

		// Send app not running notification.
		client.publish('pm:app_running', self._id+'|false');
		
		console.log("Process not running/unable to stop");

		self.starting = true;
		self.unManageProcess();
		
		return false;
	}
}

Process.prototype.getEnvironment = function (cb) {
	var self = this;

	models.AppEnvironment.find({
		app: self.app_id
	}, function(err, environmentVariables) {
		if (err) return cb(err);
		
		var env = {};
		env.NODE_ENV = 'production';
		
		for (var i = 0; i < environmentVariables.length; i++) {
			var envv = environmentVariables[i];
			env[envv.name] = envv.value;
		}

		env.PORT = proxy_from_port++;
		self.port = env.PORT;

		console.log(env);
		console.log(self);

		cb(null, env);
	});
}

stack.forEach(function (node) {
	require('./extensions/'+node+'.js').stack(Process);
});