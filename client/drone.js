var token = require('./token')
	, deploy = require('./deploy')
	, api = require('./api')
	, socket = api.socket

exports.start = function () {
	token.getToken(function(token) {
		deploy.getPackage(function(pkg, location) {
			socket.emit('start', {
				pkg: pkg,
				location: location,
				token: token.toString()
			})
		});
	});
}

exports.stop = function () {
	token.getToken(function(token) {
		deploy.getPackage(function(pkg, location) {
			socket.emit('stop', {
				pkg: pkg,
				location: location,
				token: token.toString()
			})
		});
	});
}

exports.restart = function () {
	token.getToken(function(token) {
		deploy.getPackage(function(pkg, location) {
			socket.emit('restart', {
				pkg: pkg,
				location: location,
				token: token.toString()
			})
		});
	});
}

exports.getLog = function () {
	
}
