var restler = require('restler')

exports.doLogin = function (data, callback) {
	restler.post('http://localhost:3000/login', {
		data: data
	}).on('complete', function(data, response) {
		callback(data, response)
	})
}

exports.usernameAvailable = function (username, callback) {
	restler.get('http://localhost:3000/username/'+username+'/available')
	.on('complete', function(data) {
		callback(data)
	})
}

exports.doRegister = function (data, callback) {
	restler.post('http://localhost:3000/register', {
		data: data
	}).on('complete', function(data, response) {
		callback(data, response);
	})
}
