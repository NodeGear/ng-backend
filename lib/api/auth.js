var Drone = require('../drone/drone')
	, exec = require('child_process').exec
	, User = require('../authentication/user').User
	, async = require('async')
	, cloud = require('../cloud')
	, fs = require('fs')

exports.checkToken = function (req, res, next) {
	User.authenticate(req.body.token, function(user) {
		if (user == null) {
			res.send({
				status: 403,
				error: "Bad auth token"
			})
			return;
		}
		
		req.user = user;
		
		next();
	});
}

exports.checkUsername = function (req, res) {
	var username = req.params.username;
	
	User.taken(username, function(taken) {
		res.send({
			taken: taken
		})
	})
}

exports.doLogin = function (req, res) {
	var username = req.body.username;
	var password = req.body.password;
	
	User.findOne({
		username: username,
		password: password
	}, function(err, user) {
		if (err) throw err;
		
		if (user) {
			user.generateToken(function(token) {
				res.send({
					status: 200,
					token: token
				})
			})
		} else {
			res.send({
				status: 403
			})
		}
	})
}

exports.doRegister = function (req, res) {
	var username = req.body.username;
	var password = req.body.password;
	var email = req.body.email;
	var name = req.body.name;
	
	async.parallel({
		username: function(cb) {
			User.taken(username, function(taken) {
				cb(null, taken)
			});
		},
		email: function(cb) {
			User.takenEmail(email, function(taken) {
				cb(null, taken);
			})
		}
	}, function(err, data) {
		var error = false;
		var errors = {};
		if (data.username == true) {
			errors.username = "Taken"
			error = true;
		}
		if (data.email == true) {
			errors.email = "Taken"
			error = true;
		}
		
		if (error == false) {
			// OK
			var user = new User({
				email: email,
				name: name,
				username: username,
				password: password //TODO ENCRYPT THIS
			}).save(function(err) {
				if (err) throw err;
				
				res.send({
					status: 200
				})
			})
		} else {
			res.send({
				status: 403,
				errors: errors
			})
		}
	});
}