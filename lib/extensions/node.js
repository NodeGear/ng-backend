var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, async = require('async')
	, exec = require('child_process').exec
	, spawn = require('child_process').spawn
	, forever = require('forever-monitor')
	, backend = require('../backend')
	, config = require('../config')
	, models = require('ng-models')
	, client = backend.redis_client
	, fs = require('fs');

exports.stack = function (Process) {
	[
		'processExit',
		'processError',
		'processStart',
		'processStop',
		'processRestart',
		'getSystemUser',
		'installPrivateKey',
		'installProcess',
		'cleanProcess',
		'launchNode',
		'installNode'
	].forEach(function (method) {
		Process.prototype[method] = exports[method];
	});
}

// Process events.
exports.processExit = function() {
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
exports.processError = function(e) {
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
exports.processStart = function(proc, data) {
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
exports.processStop = function(proc) {
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
exports.processRestart = function() {
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

exports.launchNode = function (results) {
	var self = this;

	if (!self.uid || !self.gid) {
		self.getSystemUser(function () {
			self.installNode(results);
		});
	} else {
		self.installNode(results);
	}
}

exports.installNode = function (results) {
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
	});
}

exports.getSystemUser = function(cb) {
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

exports.installPrivateKey = function(app, cb) {
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

exports.installProcess = function(app, cb) {
	var self = this;

	var user = app.user;

	// /home/:user_id/:process_id
	self.app_location = '/home/'+user+'/'+self._id+'/';

	var branch = app.branch;
	if (!branch) branch = "master";

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
		cwd: '/home/'+user,
		env: {
			HOME: '/home/'+user,
			OLDPWD: '/home/'+user,
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

exports.cleanProcess = function() {
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