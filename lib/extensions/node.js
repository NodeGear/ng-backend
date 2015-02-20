var mongoose = require('mongoose'),
	schema = mongoose.Schema,
	ObjectId = schema.ObjectId,

	async = require('async'),
	exec = require('child_process').exec,
	spawn = require('child_process').spawn,
	backend = require('../backend'),
	config = require('../config'),
	models = require('ng-models'),
	client = backend.redis_client,
	fs = require('fs'),
	httpRequest = require('../request').httpRequest,
	request = require('request'),
	bugsnag = require('bugsnag'),
	logtrail = require('logtrail');

exports.stack = function (Process) {
	[
		'processExit',
		'processError',
		'processStart',
		'processStop',
		'processRestart',
		'installPrivateKey',
		'installProcess',
		'cleanProcess',
		'launchNode',
		'installNode',
		'node_deleteContainer',
		'node_createContainer',
		'node_startContainer',
		'node_stopContainer',
		'shipSnapshot'
	].forEach(function (method) {
		Process.prototype[method] = exports[method];
	});
}

// Process events.
exports.processExit = function() {
	var self = this;
	
	logtrail.trace("Process Died", this);

	self.process = null;
	self.restart_process = false;
	
	self.removeFromProxy();

	if (!self.intended_stop) {
		// was not paused intentionally, a crash.
		// No more processes running, email user.
		logtrail.log("##### Unintentional crash!");

		models.AppEvent.AddEvent(self._id, self.app_id, "Shut Down", "App Quit. Logs may reveal more information.");

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
					We're just letting you know that your application <code>"+app.name+"</code> has shut down.<br/>\
					Started: "+(new Date(self.start_time)).toString()+"<br/>\
					Server: "+backend.server.name+"<br/>\
					Here are the last "+lines.length+" entries to the application log:<br/>\
					<pre>"+output+"</pre>\
					<br/>\
					<a href=\"https://nodegear.io\">Control Panel</a>\
				");
			})
		});
	}

	self.getProcess(function (app_process) {
		app_process.running = false;
		app_process.containerID = null;

		self.running = false;
		self.starting = false;

		app_process.save();
	});

	self.getUptime(function (uptime) {
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

	logtrail.trace('Process Error', e);

	self.process = null;

	self.processOutput(e.toString(), '[ERR] > ');
	logtrail.log("Error:", e);

	self.getProcess(function(app_process) {
		app_process.running = true;
		app_process.save();
	});

	self.cleanProcess();
}

// Process was Started
exports.processStart = function() {
	var self = this;
	
	logtrail.trace("Started", this);
	logtrail.trace("App Process was Started");

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
		app_process.containerID = self.container;

		app_process.save();
	});
}

// Process was Stopped
exports.processStop = function() {
	var self = this;
	
	if (self.isRestarting) {
		logtrail.trace("Stop event, doing nothing.", this)
		return;
	}

	self.running = false;
	self.starting = false;
	
	logtrail.trace("Process was Stopped", this)
	
	models.AppEvent.AddEvent(self._id, self.app_id, "Stop", "Process Stopped")

	self.getProcess(function(app_process) {
		app_process.running = false;
		app_process.containerID = null;
		
		app_process.save();
	});
}

// Process was Restarted
exports.processRestart = function() {
	var self = this;
	
	logtrail.trace("Process Restarted", this);
	
	models.AppEvent.AddEvent(self._id, self.app_id, "Restart", "Process restarted")
	
	self.removeFromProxy();

	self.running = true;
	self.starting = false;
	self.restart_process = false;

	self.getProcess(function(app_process) {
		app_process.running = true;
		app_process.containerID = self.container;
		
		app_process.save();
	});
}

exports.launchNode = function (results) {
	this.installNode(results);
}

exports.node_createContainer = function (results) {
	logtrail.trace('enter node_createContainer', this, results);

	var self = this;

	var environment = [];
	for (var e in results.environment) {
		if (e.toLowerCase() == 'port') continue;

		environment.push(e+'='+results.environment[e]);
	}
	environment.push('PORT=80');

	var data = '';
	httpRequest().post('/containers/create', {
		"Hostname": "",
		"Domainname": "",
		"User": "",
		"Memory": backend.server.app_memory * 1024 * 1024,
		"MemorySwap": 0,
		"CpuShares": 0,
		"Cpuset": "",
		"AttachStdin": false,
		"AttachStdout": false,
		"AttachStderr": false,
		"PortSpecs": null,
		"ExposedPorts": {
			"80/tcp": { }
		},
		"Tty": false,
		"OpenStdin": false,
		"StdinOnce": false,
		"Env": environment,
		"Cmd": null,
		"Image": "castawaylabs/node-docker",
		"Volumes": {
		//	'/srv/app': {},
		//	'/root/.ssh': {}
		},
		"WorkingDir": "",
		"Entrypoint": null,
		"NetworkDisabled": false,
		"OnBuild": null
	}).onData(function (chunk) {
		data += chunk;
	}).run(function (status) {
		logtrail.info('Done Create', self, status);

		//logtrail.trace(data);
		if (status == 201) {
			try {
				data = JSON.parse(data);
				logtrail.trace('done create', data);
				
				self.container = data.Id;
				self.node_startContainer(results);
			} catch (e) {
				logtrail.error("Failed parsing data", e);
				self.processOutput(e.message);
			}
		} else {
			self.processOutput('Could not start container: '+status);
			self.starting = false;
			self.running = false;

			self.processExit();
		}
	});
}

exports.node_startContainer = function (results) {
	var self = this;

	logtrail.trace('enter node_startContainer', this, results);

	var binds = [];
	binds.push('/home/ng_users/'+results.app.user+'/'+self._id+":/srv/app:rw");
	binds.push('/home/ng_users/'+results.app.user+'/.ssh:/root/.ssh:r');

	data = {
		"Binds": binds,
		"ContainerIDFile": "",
		"LxcConf": [],
		"Privileged": false,
		"PortBindings": {
			"80/tcp": [
				{
					"HostIp": "",
					"HostPort": ''+results.environment['PORT']
				}
			]
		},
		"Links": [],
		"PublishAllPorts": false,
		"Dns": ['8.8.8.8', '8.8.4.4'],
		"DnsSearch": null,
		"VolumesFrom": null,
		"NetworkMode": "bridge",
		CapAdd: null,
		CapDrop: null,
		RestartPolicy: {
			Name: "",
			MaximumRetryCount: 0
		}
	};

	httpRequest().post('/containers/'+self.container+'/start', data)
	.onData(function (chunk) {
		logtrail.trace('create', self.container, '~>', chunk);
	})
	.run(function (status) {
		logtrail.trace('node_startContainer Status', status);
		if (status != 204) {
			logtrail.info('Container did not start successfully', status);
			self.starting = false;
			self.running = false;

			self.processExit();

			return;
		}

		self.processOutput("\n\nApplication Started!\n===============\n");
		logtrail.trace('Running on ', results.environment['PORT']);

		self.getDockerLogs(self.container);
	});
}

exports.node_stopContainer = function () {
	var self = this;

	logtrail.trace('enter node_stopContainer', this);

	httpRequest().post('/containers/'+self.container+'/stop?t=5', {})
	.run(function (status) {
		logtrail.info('node_stopContainer', self, status);
	});
}

exports.node_deleteContainer = function () {
	var self = this;

	logtrail.trace('enter node_deleteContainer', this);

	httpRequest().delete('/containers/'+self.container+'?v=1')
	.run(function (status) {
		logtrail.trace(status, 'Deleted container', self.container);
		self.container = null;
	});
}

exports.installNode = function (results) {
	var self = this;

	logtrail.trace('enter installNode(results)', this, results);

	async.waterfall([
		function (done) {
			// Create user home
			fs.mkdir('/home/'+results.app.user+'/', 493, function() {
				done();
			});
		},
		function (done) {
			// Install user's private key [if any]
			self.installPrivateKey(results.app, function() {
				done();
			});
		},
		function (done) {
			self.getProcess(function(app_process) {
				if (app_process.dataSnapshot == null) {
					return done(null, false);
				}

				var snapshotPath = '/tmp/snapshot_'+app_process.dataSnapshot+'.diff';

				// Download the snapshot
				var writeStream = fs.createWriteStream(snapshotPath);
				writeStream.on('error', function (err) {
					logtrail.log("Error writing snapshot", err);
					bugsnag.notify(err);
					done(null);
				});
				writeStream.on('finish', function () {
					done(null, snapshotPath);
				});

				request({
					url: config.credentials.storage.server+'/snapshots/'+app_process.dataSnapshot+'.diff',
					method: 'GET',
					headers: {
						'Authorization': config.credentials.storage.auth
					}
				}, function (err) {
					if (err) {
						logtrail.fatal('Could not download snapshot', err);
						done(err);
					}
				}).pipe(writeStream);
			});
		},
		function (snapshotPath, done) {
			// Pull from git
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
				
				done();
			}, snapshotPath);
		},
		function (done) {
			self.node_createContainer(results);
			done();
		}
	], function (err) {
		if (err) {
			logtrail.error('Could not install due to error', err);
			bugsnag.notify(err);

			self.cleanProcess();
		}
	})
}

exports.installPrivateKey = function (app, cb) {
	var self = this;

	logtrail.trace('enter installPrivateKey(app, cb)', self, app, typeof cb);

	models.RSAKey.findOne({
		user: app.user,
		deleted: false,
		installing: false,
		installed: true,
		system_key: true
	}).select('private_key public_key').lean().exec(function(err, system_key) {
		if (err) throw err;

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

exports.installProcess = function(app, cb, snapshotPath) {
	var self = this;

	logtrail.trace('enter installProcess(app, cb, snapshotPath)', self, app, typeof cb, snapshotPath);

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

	var args = [user, self._id, app.location, branch];
	if (snapshotPath) {
		args.push(1, snapshotPath);
	} else {
		args.push(0)
	}

	logtrail.log('install args', args);

	var install = spawn("/ng-scripts/installProcess.sh", args, {
		uid: self.uid,
		gid: self.gid,
		cwd: '/home/'+user,
		env: {
			HOME: '/home/'+user,
			OLDPWD: '/home/'+user,
			PWD: '/home/'+user,
			LOGNAME: 'root',
			USER: 'root',
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

	logtrail.trace('cleanProcess', self);

	var location = self.app_location;
	if (!location) {
		logtrail.error("Bad Location -- Cannot Clean App");
		return;
	}

	self.node_deleteContainer();

	models.App.findOne({
		_id: self.app_id
	}).select('user').exec(function(err, app) {
		if (err) throw err;

		var args = [app.user, location];
		var snapshot = null;

		if (config.credentials.storage.enabled) {
			snapshot = new models.AppProcessDataSnapshot({
				app: self.app_id,
				originProcess: self._id,
				originServer: backend.server._id
			});
			args.push(1, '/tmp/snapshot_'+snapshot._id+'.diff');
		} else {
			args.push(0);
		}

		var update = spawn(__dirname+"/../scripts/cleanProcess.sh", args);
		update.on('close', function(code) {
			logtrail.log('Clean exit:', code);

			if (code === 0) {
				logtrail.log("Clean exit - app cleaned");
			} else {
				logtrail.log("App could not be cleaned");
			}

			if (snapshot != null) {
				fs.stat(args[args.length-1], function (err, stats) {
					if (err) {
						logtrail.fatal('Could not stat log', err);
						bugsnag.notify(err);
						return;
					}

					snapshot.contentSize = stats.size;
					snapshot.save(function (err) {
						if (err) {
							return bugsnag.notify(err);
						}
					});

					models.AppProcess.update({
						_id: self._id
					}, {
						$set: {
							dataSnapshot: snapshot._id
						}
					}, function (err) {
						if (err) {
							return bugsnag.notify(err);
						}
					});
					
					self.shipSnapshot(snapshot);
				});
			}

			self.unManageProcess();

			backend.bus.emit('app:stop', {
				app: self.app_id,
				process: self._id
			});
		});
		update.stdout.on('data', function(data) {
			logtrail.log('Clean script ->', data.toString())
		});
		update.stderr.on('data', function(data) {
			logtrail.log('Clean script (STDERR) ->', data.toString())
		});
	});
}

exports.shipSnapshot = function (snapshot) {
	logtrail.trace('enter shipSnapshot(snapshot)', snapshot);
	
	var r = request({
		url: config.credentials.storage.server+'/snapshots/',
		method: 'POST',
		headers: {
			'Authorization': config.credentials.storage.auth
		}
	}, function (err, res, body) {
		fs.unlink('/tmp/snapshot_'+snapshot._id+'.diff', function (err) {
			if (err) {
				logtrail.log('Could not remove snapshot', snapshot);
				return bugsnag.notify(err);
			}
		})

		if (err) {
			logtrail.log('Snapshot save err:', err);
			return bugsnag.notify(err);
		}
	});
	
	var form = r.form()
	form.append(snapshot._id+'.diff', fs.createReadStream('/tmp/snapshot_'+snapshot._id+'.diff'));
}
