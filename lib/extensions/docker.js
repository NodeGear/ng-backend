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
	, fs = require('fs')
	, http = require('http');

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

var Request = function () {
	this.req = {
		socketPath: '/var/run/docker.sock',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': 'Docker-Client/1.1.0'
		}
	}

	this.cb_onError = function () {};
	this.cb_onData = function () {};
}
var httpRequest = function () {
	return new Request;
}
exports.httpRequest = httpRequest;

Request.prototype.post = function (url, data) {
	this.req.method = 'POST';
	this.req.path = url;
	this.data = data;

	return this;
}

Request.prototype.get = function (url) {
	this.req.method = 'GET';
	this.req.path = url;

	return this;
}

Request.prototype.error = function (callback) {
	this.cb_onError = callback;

	return this;
}

Request.prototype.onData = function (callback) {
	this.cb_onData = callback;

	return this;
}

Request.prototype.run = function (callback) {
	var self = this;
	
	var req = http.request(self.req, function (res) {
		res.setEncoding('utf8');

		res.on('data', self.cb_onData);
		res.on('end', function () {
			callback(res.statusCode);
		})
	});

	req.on('error', self.cb_onError);

	if (self.data) {
		req.write(JSON.stringify(self.data));
	}

	req.end();
}

exports.startDocker = function (container) {
	var self = this;

	console.log("Starting docker", container);

	var data = {
		"Binds":[],
		"Links":[],
		"LxcConf":{"lxc.utsname":"docker"},
		"PortBindings":{},
		"PublishAllPorts":false,
		"Privileged":false,
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

	httpRequest().get('/containers/'+container+'/logs?stderr=1&stdout=1&follow=1')
	.onData(function (chunk) {
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
			"Hostname":"",
			"User":"",
			"Memory":0,
			"MemorySwap":0,
			"AttachStdin":false,
			"AttachStdout":false,
			"AttachStderr":false,
			"PortSpecs":null,
			"Tty":false,
			"OpenStdin":false,
			"StdinOnce":false,
			"Env":null,
			"Cmd": results.app.docker.command.split(' '),
			"Image": results.app.docker.image,
			"Volumes":{
			},
			"WorkingDir":"",
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
					console.log(data);
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