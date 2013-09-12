var restler = require('restler')
	, io = require('socket.io-client')
	, token = require('./token')

if (process.env.SANDBOX) {
	exports.api = "http://127.0.0.1:3000/";
	exports.hosts = {
		local: "http://localhost:3000/"
	}
} else {
	exports.api = "http://api.nodecloud.matej.me/";
	exports.hosts = {
		us: "http://us.nodecloud.matej.me/",
		fr: "http://fr.nodecloud.matej.me/"
	}
}

exports.socket = socket = io.connect(exports.api)

token.getToken(function(token) {
	if (!token) {
		return;
	}
	
	socket.emit('auth', {
		token: token.toString()
	})
})

socket.on('auth', function(data) {
	// data.success | BOOL
})

socket.on('dronedata', function(data) {
	console.log(data)
})

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
