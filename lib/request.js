var http = require('http');

var Request = function () {
	this.req = {
		socketPath: '/var/run/docker.sock',
//		host: '192.168.59.103',
//		port: 2375,
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

Request.prototype.delete = function (url) {
	this.req.method = 'DELETE';
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

exports.httpRequest = httpRequest;
exports.Request = Request;