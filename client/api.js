var restler = require('restler')
	, io = require('socket.io-client')

if (process.env.SANDBOX) {
	exports.api = "http://127.0.0.1:3000/";
	exports.hosts = {
		local: "http://localhost:3000/"
	}
} else {
	exports.api = "http://us.nodecloud.matej.me/";
	exports.hosts = {
		us: "http://us.nodecloud.matej.me/",
		fr: "http://fr.nodecloud.matej.me/"
	}
}

exports.socket = socket = io.connect(exports.api)

exports.doLogin = function (data, callback) {
	restler.post(exports.api+'login', {
		data: data
	}).on('complete', function(data, response) {
		callback(data, response)
	})
}

exports.usernameAvailable = function (username, callback) {
	restler.get(exports.api+'username/'+username+'/available')
	.on('complete', function(data) {
		callback(data)
	})
}

exports.doRegister = function (data, callback) {
	restler.post(exports.api+'register', {
		data: data
	}).on('complete', function(data, response) {
		callback(data, response);
	})
}
