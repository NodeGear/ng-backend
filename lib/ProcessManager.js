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
	, stringDecoder = new (require('string_decoder').StringDecoder)('utf-8')
	, fs = require('fs');

var processes = [];
var proxy_from_port = 9000;

var Process = function(app_process) {
	this.app_id = app_process.app;
	this._id = app_process._id;

	this.process = null;
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
}

exports.fetchProcesses = function() {
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

Process.prototype.getUptime = function(cb) {
	var self = this;

	if (!self.uptime) {
		// Make it.
		var uptime = self.createUptime();

		cb(uptime);

		return;
	}

	models.AppProcessUptime.findOne({
		_id: self.uptime
	}, function(err, uptime) {
		if (err) throw err;

		if (!uptime) {
			uptime = self.createUptime();
		}

		cb(uptime);
	})
}

Process.prototype.createUptime = function() {
	var self = this;

	var uptime = new models.AppProcessUptime({
		app: self.app_id,
		process: self._id,
		server: backend.server._id,
		price_per_hour: backend.server.price_per_hour
	});
	uptime.save();

	uptime.setUser();

	self.uptime = uptime._id;

	return uptime;
}

// Process events.
Process.prototype.processExit = function() {
	var self = this;
	
	console.log("Process Died");

	self.process = null;
	self.restart_process = false;
	
	self.removeFromProxy();

	if (!self.intended_stop) {
		// was not paused intentionally, a crash.
		// No more processes running, email user.
		console.log("##### Unintentional crash!");

		models.AppEvent.AddEvent(self._id, self.app_id, "Shut Down", "App Exited. Please refer to logs for more information");

		models.App.findOne({
			_id: self.app_id
		}).populate('user').exec(function(err, app) {
			if (err) throw err;

			client.lrange('pm:app_process_log_'+self.current_log, 0, 19, function(err, lines) {
				if (err) throw err;

				if (lines.length == 0) {
					lines.push("No Log output available.");
				}

				var output = lines.join('');
				app.user.sendEmailText(
					"Nodegear PM Daemon <notifications@nodegear.com>",
					"[DOWN] '"+app.name+"' Went Down",
					"Hello "+app.user.name+",<br/>\
					<br/>\
					We're writing to let you know that your application <code>"+app.name+"</code> has shut down.<br/>\
					Started: "+(new Date(self.start_time)).toString()+"<br/>\
					Server: "+backend.server.name+"<br/>\
					Here are the last "+lines.length+" entries to the application log:<br/>\
					<pre>"+output+"</pre>\
					<br/>\
					.. console link, app link missing (not intentionally) ..\
				");
			})
		});
	}

	self.getProcess(function(app_process) {
		app_process.running = false;
		self.running = false;
		self.starting = false;
		app_process.save();
	});

	self.getUptime(function(uptime) {
		uptime.end = Date.now();
		uptime.sealed = true;

		var diff = uptime.end - uptime.start;
		uptime.minutes = Math.round((diff / 1000 / 60) * 100) / 100;

		uptime.save();
	});

	process.nextTick(self.cleanProcess.bind(self));
}

// Fatal error
Process.prototype.processError = function(e) {
	var self = this;

	self.process = null;

	self.processOutput(e.toString(), '[ERR] > ');
	console.log("Error:", e);

	self.getProcess(function(app_process) {
		app_process.running = true;
		app_process.save();
	});

	self.cleanProcess();
}

// Process was Started
Process.prototype.processStart = function(proc, data) {
	var self = this;
	
	console.log("Started");
	console.log("App Process was Started");

	self.running = true;
	self.starting = false;

	self.intended_stop = false;
	models.AppEvent.AddEvent(self._id, self.app_id, "Start", "Process has been Started")

	self.addToProxy();

	backend.bus.emit('app:start', {
		app: self.app_id,
		process: self._id
	});

	self.getUptime(function(uptime) {
		if (!uptime.start) {
			uptime.start = Date.now();
		}

		uptime.save();
	})

	self.getProcess(function(app_process) {
		app_process.running = true;
		app_process.save();
	});
}

// Process was Stopped
Process.prototype.processStop = function(proc) {
	var self = this;
	
	if (self.isRestarting) {
		console.log("Stop event, doing nothing.")
		return;
	}

	self.running = false;
	self.starting = false;
	
	console.log("Process was Stopped")
	
	models.AppEvent.AddEvent(self._id, self.app_id, "Stop", "Process Stopped")

	self.getProcess(function(app_process) {
		app_process.running = false;
		app_process.save();
	});
}

// Process was Restarted
Process.prototype.processRestart = function() {
	var self = this;
	
	console.log("Process Restarted")
	
	models.AppEvent.AddEvent(self._id, self.app_id, "Restart", "Process restarted")
	
	self.removeFromProxy();

	self.running = true;
	self.starting = false;
	self.restart_process = false;

	self.getProcess(function(app_process) {
		app_process.running = true;
		app_process.save();
	});
}

Process.prototype.processOutput = function(chunk, prefix) {
	var self = this;

	if (typeof prefix === 'undefined') prefix = '';

	var string = chunk;
	if (typeof chunk !== 'string') {
		string = stringDecoder.write(chunk);
	}

	string = prefix+string;

	if (process.env.NG_TEST || process.env.NODE_ENV != 'production') {
		process.stdout.write(string)
	}

	if (this.inserted_log_to_redis != true) {
		this.inserted_log_to_redis = true;
		client.lpush('pm:app_process_logs_'+self._id, self.current_log);
		client.publish("pm:app_log_new", self._id);
	}

	client.lpush('pm:app_process_log_'+self.current_log, string);
	client.publish("pm:app_log_entry", self._id+'|'+string);
}

// Boot the process
Process.prototype.launchProcess = function (cb) {
	if (typeof cb === 'undefined') cb = function() {};

	var self = this;

	var now = Date.now();
	self.start_time = now;
	self.inserted_log_to_redis = false;

	async.parallel({
		user: function(done) {
			if (!self.uid || !self.gid) {
				return self.getSystemUser(done);
			}

			done(null);
		},
		app: function(done) {
			models.App.findOne({
				_id: self.app_id
			}).select('branch script user location').exec(done);
		},
		environment: self.getEnvironment.bind(self)
	}, function(err, results) {
		if (err) throw err;

		// Log 'file' -- redis db.
		self.current_log = self._id+'_'+self.start_time;

		// Install user's private key [if any]
		self.installPrivateKey(results.app, function() {
			// Install
			// Install log goes to redis. Prefix INSTALL>
			self.installProcess(results.app, function(err) {
				if (err) {
					models.AppEvent.AddEvent(self._id, self.app_id, "Install Error", "Application Could not be Installed at this time.");
					// Send app not running notification.
					client.publish('pm:app_running', self._id+'|false');
					self.starting = false;
					self.running = false;

					self.cleanProcess();

					return;
				}
				
				proc = new (forever.Monitor)(results.app.script, {
					max: 1,
					silent: true,
					minUptime: 500,
					sourceDir: self.app_location,
					env: results.environment, // Define app environment
					cwd: self.app_location,
					killTree: true,
					spawnWith: {
						uid: self.uid,
						gid: self.gid
					}
				});
				
				self.process = proc;

				proc.on('error', self.processError.bind(self));
				proc.on('exit', self.processExit.bind(self));
				proc.on('start', self.processStart.bind(self));
				proc.on('stop', self.processStop.bind(self));
				proc.on('restart', self.processRestart.bind(self));
				proc.on('stdout', self.processOutput.bind(self));
				proc.on('stderr', self.processOutput.bind(self));
				
				// Start the process
				proc.start();

				cb();
			});
		})
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
	
	if (self.process && self.process.running && self.process.child.pid) {
		self.process.stop();
		console.log("Process", self.process.uid, "Stopped");

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

Process.prototype.addToProxy = function() {
	var self = this;

	models.App.findOne({
		_id: self.app_id
	}).populate('user').select('user').exec(function(err, app) {
		if (err) throw err;

		models.AppDomain.find({
			app: app._id
		}, function(err, domains) {
			var doms = {};

			for (var i = 0; i < domains.length; i++) {
				var domain = domains[i];

				if (domain.is_subdomain) {
					doms[domain.domain+'.'+app.user.username+'.ngapp.io'] = self.app_id;
				} else {
					doms[domain.domain] = self.app_id;
				}
			}

			if (domains.length == 0) {
				self.processOutput("\n No Domains Set, your app won't be accessible! Stopping app.\n");
				models.AppEvent.AddEvent(self._id, self.app_id, "Start Error", "App Could not be Started because it has not defined any domains.");
				self.stop();

				return;
			}
			
			client.hmset('proxy:domains', doms, function(err) {
				if (err) throw err;
			});

			client.sadd('proxy:app_'+self.app_id, self._id, function(err) {
				if (err) throw err;
			});

			client.hmset('proxy:app_process_'+self._id, {
				hostname: backend.server.location,
				port: self.port
			}, function(err) {
				if (err) throw err;
			});
		})
	})
}

Process.prototype.removeFromProxy = function() {
	var self = this;

	client.del('proxy:app_process_'+self._id);

	client.smembers('proxy:app_'+self.app_id, function(err, processes) {
		if (err) throw err;

		client.srem('proxy:app_'+self.app_id, self._id);
		
		if (processes.length > 1) {
			return;
		}

		client.hgetall('proxy:domains', function(err, domains) {
			if (err) throw err;

			var to_delete = [];
			for (dom in domains) {
				if (!domains.hasOwnProperty(dom)) {
					continue;
				}

				var app_id = domains[dom];
				if (app_id == self.app_id) {
					// Remove this domain.
					to_delete.push(dom);
				}
			}

			if (to_delete.length == 0) {
				// Would throw an exception
				return;
			}

			// HDEL takes an array as argument, therefore the first in that array has to be the key of the table.
			to_delete.splice(0, 0, 'proxy:domains');

			client.hdel(to_delete, function(err) {
				if (err) throw err;
			})
		})
	});
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

Process.prototype.getSystemUser = function(cb) {
	if (typeof cb === 'undefined') cb = function() {}

	var self = this;

	models.App.findOne({
		_id: self.app_id
	}).select('user').exec(function(err, app) {
		if (err) throw err;

		var user = app.user;

		var update = exec(__dirname+"/scripts/getUser.sh "+user);
		update.on('close', function(code) {
			if (code !== 0) {
				console.log("User Could not be Created!");
			}

			if (!self.uid || !self.gid) {
				cb("Could not find/create user");
			} else {
				cb(null);
			}
		})
		update.stdout.on('data', function(data) {
			console.log(data);
			var split = data.split('|');
			if (split.length == 2) {
				self.uid = parseInt(split[0]);
				self.gid = parseInt(split[1]);
			}
		})
	});
}

Process.prototype.installPrivateKey = function(app, cb) {
	var self = this;

	models.RSAKey.findOne({
		user: app.user,
		deleted: false,
		installing: false,
		installed: true,
		system_key: true
	}).select('private_key public_key').lean().exec(function(err, system_key) {
		if (err) throw err;

		console.log(system_key);

		if (system_key == null) {
			return cb();
		}

		var location = '/home/'+app.user+'/.ssh/id_rsa';

		// Creates .ssh, writes [config, id_rsa, id_rsa.pub], 
		async.series([
			function (done) {
				// create the .ssh folder.. ignore errors (such as already exists)
				// 448 (base 10) is 700 (base 8)
				fs.mkdir('/home/'+app.user+'/.ssh', 448, function() {
					done();
				});
			},
			function (callback) {
				// Write config & keys

				async.parallel([
					function (done) {
						fs.writeFile(location, system_key.private_key, {
							mode: 384 // base 8 = 0600
						}, done);
					},
					function (done) {
						// although the public key is useless, the client may access it if they wish
						fs.writeFile(location+'.pub', system_key.public_key, {
							mode: 420 // base 8 = 0644
						}, done);
					},
					function (done) {
						var config = "Host *\n\
	StrictHostKeyChecking no\n\
	CheckHostIp no\n\
	PasswordAuthentication no\n";

						fs.writeFile('/home/'+app.user+'/.ssh/config', config, {
							mode: 420 // 0644
						}, done);
					}
				], callback)
			},
			function (callback) {
				// Fix permissions

				async.each(['.ssh', '.ssh/id_rsa', '.ssh/id_rsa.pub', '.ssh/config'], function(file, done) {
					fs.chown('/home/'+app.user+'/'+file, self.uid, self.gid, done);
				}, callback);
			},
		], cb)
	});
}

Process.prototype.installProcess = function(app, cb) {
	var self = this;

	// /home/:user_id/:process_id
	self.app_location = '/home/'+app.user+'/'+self._id+'/';

	var branch = app.branch;
	if (!branch) branch = "master";

	var user = app.user;

	self.processOutput("\n Installation of App "+app._id+"\n");
	self.processOutput(" ======================\n\n");

	if (!app.location) {
		self.processOutput(" [ERR] Cannot Install:\n");
		self.processOutput(" [ERR] App Does not have a valid location '"+app.location+"'\n");
	}

	var is_test = !!process.env.NG_TEST;
	var install = spawn("/ng-scripts/installProcess.sh", [user, self._id, app.location, branch, is_test ? '-q' : ''], {
		uid: self.uid,
		gid: self.gid,
		cwd: '/home/'+app.user,
		env: {
			HOME: '/home/'+user,
			OLDPWD: '/home/'+app.user,
			PWD: '/home/'+user,
			LOGNAME: user,
			USER: user,
			TERM: 'xterm',
			SHELL: '/bin/bash',
			PATH: '/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:/root/bin',
			LANG: 'en_GB.UTF-8'
		}
	});
	install.stdout.on('data', self.processOutput.bind(self));
	install.stderr.on('data', self.processOutput.bind(self));

	install.on('close', function(code) {
		if (code !== 0) {
			self.processOutput("Could not install, exit code "+code+"\n", '>> INSTALL ERROR -- ');
			return cb(true);
		}

		self.processOutput("\n Installation Finished.\n");
		self.processOutput(" ======================\n\n");

		cb(null);
	});
}

Process.prototype.cleanProcess = function() {
	var self = this;

	var location = self.app_location;
	if (!location) {
		console.log("Bad Location -- Cannot Clean App");
		return;
	}

	models.App.findOne({
		_id: self.app_id
	}).select('user').exec(function(err, app) {
		if (err) throw err;

		var update = spawn(__dirname+"/scripts/cleanProcess.sh", [app.user, location]);
		update.on('close', function(code) {
			console.log(code);
			if (code === 0) {
				console.log("Clean exit - app cleaned");
			} else {
				console.log("App could not be cleaned");
			}

			self.unManageProcess();

			backend.bus.emit('app:stop', {
				app: self.app_id,
				process: self._id
			});
		})
		update.stdout.on('data', function(data) {
			console.log(data.toString())
		})
		update.stderr.on('data', function(data) {
			console.log(data.toString())
		})
	});
}