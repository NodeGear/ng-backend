var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, async = require('async')
	, exec = require('child_process').exec
	, spawn = require('child_process').spawn
	, backend = require('../backend')
	, config = require('../config')
	, models = require('ng-models')
	, client = backend.redis_client
	, fs = require('fs')
	, http = require('http')
	, httpRequest = require('../request').httpRequest;

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
	var self = this;

	console.log("Starting docker", container);

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
		console.log('Status', status);
		self.processOutput("\n\nStarted Docker Image! Wohoo.\n");

		self.getDockerLogs(container);
	});
}

exports.getDockerLogs = function (container) {
	var self = this;

	// Get teh logs enit
	console.log("Getting docker logs", container);

	httpRequest().get('/v1.14/containers/'+container+'/logs?stderr=1&stdout=1&follow=1')
	.onData(function (chunk) {
		// Docker's first 8 bytes are random shit.
		// It seems the first bit is STDERR or STDOUT (1 is STDOUT)
		if (chunk.length > 1) {
			chunk = chunk.slice(1);
		}
		
		self.processOutput(chunk);
	})
	.run(function (status) {
		console.log('Status', status);
	})
}

exports.pullDockerImage = function (image, cb) {
	var self = this;

	console.log("Pulling", image);
	httpRequest().post('/images/create?fromImage='+image).onData(function (chunk) {
		console.log(chunk);
		self.processOutput(chunk);
	}).run(function (status) {
		console.log('Image', status);
		cb();
	})
}

exports.launchDocker = function (results) {
	var self = this;

	self.pullDockerImage(results.app.docker.image, function () {
		console.log("Launching Docker");

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
			console.log('Done Create', status);

			if (status == 201) {
				try {
					data = JSON.parse(data);
					console.log('create docker', data);
					self.processOutput("\n\nStarting Docker Image..\n");
					self.startDocker(data.Id);
				} catch (e) {
					self.processOutput(e.message);
				}
			} else {
				self.processOutput('Could not start container: '+status);
			}
		});
	});
}