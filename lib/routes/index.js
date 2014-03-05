var server = require('../server')
	, models = require('../models')
	, config = require('../config')
	, fs = require('fs')
	, fsExtra = require('fs.extra')
	, tar = require('tar.gz')
	, exec = require('child_process').exec
	, mongoose = require('mongoose')
	, ProcessManager = require('../models/ProcessManager')
	, bugsnag = require('bugsnag')

exports.router = function (client) {
	client.subscribe("app_start", "app_restart", "app_stop", "app_scale", "git_hook");
	
	client.on("message", function (channel, message) {
		var msg = null;
		
		try {
			msg = JSON.parse(message);
		} catch (e) {
			console.log("Failed parsing", message, e);
			Bugsnag.notifyException(e);
		}
		
		console.log(msg);
		
		switch(channel) {
			case 'app_start':
				return startDrone(msg);
			case 'app_restart':
				return restartDrone(msg);
			case 'app_stop':
				return stopDrone(msg);
			case 'app_scale':
				return scaleDrone(msg);
			case 'git_hook':
				return gitHook(msg);
		}
	});
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

function scaleDrone (data) {
	getDrone(this, data, function(process, drone) {
		process.scale(drone, data.scale);
	});
}

function runAppUpdate (channel, repo, user, callback) {
	var location = config.droneLocation + user._id + "/" + repo + "/";
	var script = config.path+"/scripts/create_git_drone.sh "+location+" "+user.email+"/"+repo+" "+user._id+" "+config.droneLocation+user._id+"/";
	
	var run = exec(script)
	run.stdout.on('data', function(data) {
		server.redis_client.publish(channel, JSON.stringify({ message: data, exit: false }));
	})
	run.stderr.on('data', function(data) {
		server.redis_client.publish(channel, JSON.stringify({ message: data, exit: false }));
	})
	run.on('close', function(code) {
		if (code != 0) {
			// Determine the fail status and log it
			var msg = "";
			switch (code) {
				default:
				case 1:
					msg = "Unknown Failure";
					break;
				case 2:
					msg = "Failed Cloning Repository";
					break;
				case 3:
					msg = "Failed Installing Dependencies";
					break;
				case 4:
					msg = "Failed Updating Repository";
					break;
			}
			
			server.redis_client.publish(channel, JSON.stringify({ message: msg, exit: true }));
		}
		
		callback(code == 0);
	})
}

function gitHook (data) {
	var uid = data.user;
	try {
		uid = mongoose.Types.ObjectId(uid);
	} catch (e) {
		server.redis_client.publish(data.channel, JSON.stringify({
			message: "Invalid User",
			exit: true
		}));
		return;
	}
	
	models.User.findById(uid, function(err, user) {
		if (err || !user) {
			server.redis_client.publish(data.channel, JSON.stringify({
				message: "Invalid User",
				exit: true
			}));
			return;
		}
		
		var repo_split = data.repo.split('/');
		if (repo_split.length != 2) {
			server.redis_client.publish(data.channel, JSON.stringify({
				message: "Invalid Repository",
				exit: true
			}));
			return;
		}
		
		var repo = repo_split[1];
		
		models.Drone.findOne({
			user: user._id,
			name: repo
		}, function(err, drone) {
			if (err) throw err;
			
			if (!drone) {
				server.redis_client.publish(data.channel, JSON.stringify({
					message: "Creating Application...",
					exit: false
				}));
				
				runAppUpdate(data.channel, repo, user, function(success) {
					server.redis_client.publish(data.channel, JSON.stringify({
						message: "Application Created. Dependencies Installed. Parsing package, then booting your new app..",
						exit: false
					}));
					
					// Create a new one
					drone = new models.Drone({
						name: repo,
						location: config.droneLocation + user._id + "/" + repo + "/",
						user: user._id,
						isInstalled: true,
						installedOn: config.label
					});
					
					drone.populate('user', function() {
						drone.parsePackage(function(err) {
							if (err) {
								server.redis_client.publish(data.channel, JSON.stringify({
									message: err,
									exit: true
								}));
								
								return;
							}
							
							drone.save(function(err) {
								if (err) throw err;
								
								models.Drone.AddEvent(drone._id, "Created", "Your app was created via git");
								
								var process = ProcessManager.manageProcess(drone);
								process.start();
								
								endHook(data.channel, drone);
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
					server.redis_client.publish(data.channel, JSON.stringify({
						message: "Sorry, App Not Found..",
						exit: true
					}));
					
					return;
				}
				
				runAppUpdate(data.channel, repo, user, function(success) {
					drone.parsePackage(function(err) {
						if (err) {
							server.redis_client.publish(data.channel, JSON.stringify({
								message: err,
								exit: true
							}));
							
							drone.save()
							return;
						}
						
						server.redis_client.publish(data.channel, JSON.stringify({
							message: "Application Updated. Restarting.",
							exit: false
						}));
						
						if (drone.isRunning) {
							process.restart();
						} else {
							process.start();
						}
						
						drone.save();
						
						endHook(data.channel, drone)
						return;
					});
				})
			})
		})
	});
}

function endHook (channel, drone) {
	var msg = [
		"Application Updated. Restarting.",
		"Application running on PID "+drone.pid,
		"Proxying to domains:"
	]
	
	for (var i = 0; i < drone.domains.length; i++) {
		msg.push(" - "+drone.domains[i]);
	}
	msg.push(" - "+drone.subdomain+".app.nodegear.com");
	
	server.redis_client.publish(data.channel, JSON.stringify({
		message: msg.join("\n"),
		exit: true
	}));
}