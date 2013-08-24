var Drone = require('../drone/drone')
	, exec = require('child_process').exec
	, User = require('../authentication/user').User
	, async = require('async')
	, cloud = require('../cloud')
	, fs = require('fs')
	, droneAPI = require('./drone')
	, authAPI = require('./auth')

module.exports.sockets = sockets = [];

module.exports.router = function(app) {
	// Set up routes
	app.get('/drones', authAPI.checkToken, droneAPI.listDrones)
		.post('/drone/create', authAPI.checkToken, droneAPI.uploadDrone)
		.post('/register', authAPI.doRegister)
		.post('/login', authAPI.doLogin)
		.get('/username/:username/available', authAPI.checkUsername)
}

module.exports.socketRouter = function (io) {
	io.sockets.on('connection', function(socket) {
		var sock = {
			socket: socket,
			auth: false,
			user: null,
			drones: []
		}
		
		sockets.push(sock);
		
		socket.on('auth', function(data) {
			// token
			console.log("Authenticate")
			console.log(data);
			
			User.authenticate(data.token, function(user) {
				if (user != null) {
					sock.auth = true;
					sock.user = user;
					
					socket.emit('auth', {
						success: true
					})
					
					return;
				}
				
				socket.emit('auth', {
					success: false
				})
			})
		});
		
		socket.on('start', function(data) {
			// Start a drone
			console.log("Start a drone")
			console.log(data);
			
			User.authenticate(data.token, function(user) {
				if (user != null) {
					droneAPI.findDrone(data, function(drone) {
						if (drone != null) {
							drone.io = socket
							drone.start(function(proc) {
								socket.emit('dronedata', "Drone accesible on "+drone.pkg.subdomain)
								for (var i = 0; i < drone.pkg.domains.length; i++) {
									socket.emit('dronedata', " - "+drone.pkg.domains[i]);
								}
							})
						}
					});
				}
				
				socket.emit('auth', {
					success: false
				});
			});
		})
		
		socket.on('stop', function(data) {
			console.log("Stopping a drone")
			console.log(data);
			
			User.authenticate(data.token, function(user) {
				if (user != null) {
					droneAPI.findDrone(data, function(drone) {
						if (drone != null) {
							drone.io = socket;
							drone.stop(function(success) {
								if (success) {
									socket.emit('dronedata', "Drone stopped")
								} else {
									socket.emit('dronedata', "Drone not running")
								}
							})
						}
					})
				}
			})
		})
		
		socket.on('restart', function(data) {
			console.log("Restarting a drone")
			console.log(data);
			
			User.authenticate(data.token, function(user) {
				if (user != null) {
					droneAPI.findDrone(data, function(drone) {
						if (drone != null) {
							drone.io = socket;
							drone.stop(function(success) {
								if (success) {
									socket.emit('dronedata', "Drone restarted")
								} else {
									socket.emit('dronedata', "Drone not running")
								}
							})
						}
					})
				}
			})
		})
	});
}

module.exports.attachDrone = function (user, drone) {
	for (var i = 0; i < sockets.length; i++) {
		var socket = sockets[i];
		
		if (!socket.auth) continue;
		
		if (socket.user._id.equals(user._id)) {
			// Gotcha!
			socket.drones.push(drone);
			drone.io = socket;
		}
	}
}
