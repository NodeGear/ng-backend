var server = require('../server')
	, models = require('../models')
	, config = require('../config')
	, fs = require('fs')
	, fsExtra = require('fs.extra')
	, tar = require('tar.gz')
	, exec = require('child_process').exec
	, mongoose = require('mongoose')
	, ProcessManager = require('../models/ProcessManager')

exports.router = function (socket) {
	socket.on('start', startDrone)
	socket.on('stop', stopDrone)
	socket.on('restart', restartDrone)
	socket.on('git hook', gitHook)
}

function getDrone(socket, data, cb) {
	var id = data.id;
	
	models.Drone.findById(id).populate('user').exec(function(err, drone) {
		if (err) throw err;
		
		if (drone) {
			var process = ProcessManager.manageProcess(drone)
			cb(process, drone);
		} else {
			cb(null);
		}
	})
}

function startDrone(data) {
	getDrone(this, data, function(process, drone) {
		process.start();
		
		console.log("Started Drone")
	})
}

function stopDrone(data) {
	getDrone(this, data, function(process, drone) {
		process.stop();
		
		console.log("Stopped Drone")
	})
}

function restartDrone(data) {
	getDrone(this, data, function(process, drone) {
		process.restart();
		
		console.log("Restarted Drone");
	})
}

function runAppUpdate (socket, repo, user, callback) {
	var location = config.droneLocation + user._id + "/" + repo + "/";
	var script = config.path+"/scripts/create_git_drone.sh "+location+" "+data.repo+" "+user._id+" "+config.droneLocation+user._id+"/";
	
	var run = exec(script)
	run.stdout.on('data', function(data) {
		socket.emit('git hook response', data)
	})
	run.stderr.on('data', function(data) {
		socket.emit('git hook response', data)
	})
	run.on('close', function(code) {
		if (code != 0) {
			// Determine the fail status and log it
			switch (code) {
				default:
				case 1:
					socket.emit('git hook response', "Unknown Failure")
					break;
				case 2:
					socket.emit('git hook response', "Failed Cloning Repository")
					break;
				case 3:
					socket.emit('git hook response', "Failed Installing Dependencies")
					break;
				case 4:
					socket.emit('git hook response', "Failed Updating Repository")
					break;
			}
		}
		
		cb(code == 0);
	})
}

function gitHook (data) {
	var socket = this;
	var uid = data.user;
	try {
		uid = mongoose.Types.ObjectId(uid);
	} catch (e) {
		socket.emit('git hook response', "Invalid User");
		socket.emit('git hook end');
		return;
	}
	
	models.User.findById(uid, function(err, user) {
		if (err || !user) {
			socket.emit('git hook response', "Invalid User");
			socket.emit('git hook end');
			return;
		}
		
		var repo_split = data.repo.split('/');
		if (repo_split.length != 2) {
			socket.emit('git hook response', "Invalid Repository");
			socket.emit('git hook end');
			return;
		}
		
		var repo = repo_split[1];
		
		models.Drone.findOne({
			user: user._id,
			name: repo
		}, function(err, drone) {
			if (err) throw err;
			
			if (!drone) {
				socket.emit('git hook response', "Creating application. Hang on.");
				
				runAppUpdate(socket, repo, user, function(success) {
					socket.emit('git hook response', "Application Created. Dependencies Installed. Parsing package, then booting your new app :)");
					
					// Create a new one
					drone = new models.Drone({
						name: repo,
						location: location,
						user: user._id,
						isInstalled: true,
						installedOn: config.label
					});
					
					drone.populate('user', function() {
						drone.parsePackage(function(err) {
							if (err) {
								socket.emit('git hook response', err);
								socket.emit('git hook end');
							
								return;
							}
							
							drone.save(function(err) {
								if (err) throw err;
								
								models.Drone.AddEvent(drone._id, "Created", "Your app was created via git");
								
								var process = ProcessManager.manageProcess(drone);
								process.start();
								
								endHook(socket, drone);
							});
						})
					});
				})
				
				return;
			}
			
			getDrone(null, {
				id: drone._id
			}, function(process, drone) {
				if (!drone) {
					socket.emit('git hook response', "Sorry, App Not Found..");
					socket.emit('git hook end');
					return;
				}
				
				runAppUpdate(socket, repo, user, function(success) {
					drone.parsePackage(function(err) {
						if (err) {
							socket.emit('git hook response', err);
							socket.emit('git hook end');
							
							drone.save()
							return;
						}
						
						socket.emit('git hook response', "Application Updated. Restarting.");
						if (drone.isRunning) {
							process.restart();
						} else {
							process.start();
						}
						
						drone.save();
						
						endHook(socket, drone)
						return;
					});
				})
			})
		})
	});
}

function endHook (socket, drone) {
	socket.emit('git hook response', "Application running on PID "+drone.pid);
	socket.emit('git hook response', "Proxying to domains:");
	for (var i = 0; i < drone.domains.length; i++) {
		socket.emit('git hook response', " - "+drone.domains[i]);
	}
	socket.emit('git hook response', " - "+drone.subdomain+".app.nodegear.com");
	
	socket.emit('git hook end');
}