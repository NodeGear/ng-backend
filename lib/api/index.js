var Drone = require('../drone/drone')
	, exec = require('child_process').exec
	, User = require('../authentication/user').User
	, async = require('async')

module.exports = function(app) {
	// Set up routes
	app.get('/drones', listDrones)
		.post('/drone/create', createDrone)
		.post('/register', doRegister)
		.post('/login', doLogin)
		.get('/username/:username/available', checkUsername)
}

function checkUsername (req, res) {
	var username = req.params.username;
	
	User.taken(username, function(taken) {
		res.send({
			taken: taken
		})
	})
}

function doLogin (req, res) {
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

function doRegister (req, res) {
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

function listDrones (req, res) {
	
}

function createDrone(req, res) {
	User.authenticate(req.body.token, function(user) {
		if (user == null) {
			res.send({
				status: 403,
				error: "Bad auth token"
			})
			return;
		}
		
		var pkg = JSON.parse(req.body.package);
		
		if (req.files.drone) {
			var name = req.files.drone.name;
			var dir = '/tmp/nodecloud/'+Date.now()+'/';
			var target = dir+name;
		
			exec('mkdir -p '+dir+' && mv '+req.files.drone.path+' '+target+' && cd '+dir+' && tar xzf '+name+' && rm '+target, function(err) {
				if (err) throw err;
			
				drone = new Drone({
					repository: {
						type: 'local',
						path: dir
					},
					pkg: pkg,
					user: user,
					connection: res
				}, function() {
					drone.installDependencies(function(err) {
						if (err) throw err;
					
						console.log("Installed");
					
						drone.start(function(proc) {
							res.send("Drone accesible on "+drone.pkg.subdomain)
							for (var i = 0; i < drone.pkg.domains.length; i++) {
								res.send(" - "+drone.pkg.domains[i]);
							}
						})
					})
				})
			})
		}
	})
}