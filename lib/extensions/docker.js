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
	http = require('http'),
	httpRequest = require('../request').httpRequest,
	logtrail = require('logtrail');

exports.stack = function (Process) {
	[
		'startDocker',
		'getDockerLogs',
		'launchDocker',
		'pullDockerImage'
	].forEach(function (method) {
		Process.prototype[method] = exports[method];
	});
}

exports.startDocker = function (container) {
	logtrail.trace("enter startDocker", container);
	var self = this;

	var data = {
		"Binds": [],
		"Links": [],
		"LxcConf": {"lxc.utsname":"docker"},
		"PortBindings": {},
		"PublishAllPorts": false,
		"Privileged": false,
		"Dns": ["8.8.8.8"],
		"VolumesFrom": []
	};

	httpRequest().post('/containers/'+container+'/start', data)
	.run(function (status) {
		logtrail.trace('startDocker(c)', container, 'Status:', status);
		self.processOutput("\n\nStarted Docker Image! Wohoo.\n");

		self.getDockerLogs(container);
	});
}

exports.getDockerLogs = function (container) {
	logtrail.trace("enter getDockerLogs(container)", container);
	var self = this;

	httpRequest().get('/containers/'+container+'/logs?stderr=1&stdout=1&follow=1')
	.onData(function (chunk) {
		// Docker's first 8 bytes are random shit.
		// It seems the first bit is STDERR or STDOUT (1 is STDOUT)
		if (chunk.length > 8) {
			chunk = chunk.slice(8);
		}
		
		self.processOutput(chunk);
	})
	.run(function (status) {
		logtrail.log('getDockerLogs(c)', container, 'Status', status);
	})
}

exports.pullDockerImage = function (image, cb) {
	logtrail.trace("enter pullDockerImage(image, cb)", image, typeof cb);
	var self = this;

	httpRequest().post('/images/create?fromImage='+image).onData(function (chunk) {
		logtrail.trace('pullDockerImage', image, '~ Data:', chunk);
		self.processOutput(chunk);
	}).run(function (status) {
		logtrail.trace('pullDockerImage', image, 'Request done', status);
		cb();
	});
}

exports.launchDocker = function (results) {
	logtrail.trace("enter launchDocker(results)", results);
	var self = this;

	self.pullDockerImage(results.app.docker.image, function () {
		logtrail.info("Launching Docker", results);

		var data = "";
		httpRequest().post('/containers/create', {
			"Hostname": "",
			"User": "",
			"Memory": 0,
			"MemorySwap": 0,
			"AttachStdin": false,
			"AttachStdout": false,
			"AttachStderr": false,
			"PortSpecs": null,
			"Tty": false,
			"OpenStdin": false,
			"StdinOnce": false,
			"Env": null,
			"Cmd": results.app.docker.command.split(' '),
			"Image": results.app.docker.image,
			"Volumes": {
			},
			"WorkingDir": "",
			"DisableNetwork": false,
			"ExposedPorts": {
			}
		}).onData(function (chunk) {
			data += chunk;
		}).run(function (status) {
			logtrail.trace('Created Docker Container', results, status);

			if (status == 201) {
				try {
					data = JSON.parse(data);
					logtrail.trace('create docker', data);
					self.processOutput("\n\nStarting Docker Image..\n");
					self.startDocker(data.Id);
				} catch (e) {
					logtrail.error('Error parsing create container');
					self.processOutput(e.message);
				}
			} else {
				logtrail.error('Could not start container:', results, 'Status:', status);
				self.processOutput('Could not start container: '+status);
			}
		});
	});
}
