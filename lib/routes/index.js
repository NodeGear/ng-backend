var server = require('../server')
	, models = require('../models')
	, config = require('../config')
	, fs = require('fs')
	, fsExtra = require('fs.extra')
	, tar = require('tar.gz')
	, exec = require('child_process').exec
	, mongoose = require('mongoose')

exports.router = function (socket) {
	socket.on('drones', listDrones)
	socket.on('assign', assignDrone)
	socket.on('start', startDrone)
	socket.on('stop', stopDrone)
	socket.on('restart', restartDrone)
	socket.on('git hook', gitHook)
}

function listDrones (req, res) {
	var drones = server.drones;
	res.send(drones);
}

function getDrone(socket, data, cb) {
	var id = data.id;
	
	var drones = server.drones;
	var drone = null;
	
	var found = false;
	for (var i = 0; i < drones.length; i++) {
		if (drones[i]._id.equals(mongoose.Types.ObjectId(id))) {
			found = true;
			drone = drones[i];
			break;
		}
	}
	
	if (!found) {
		models.Drone.findById(id).populate('user').exec(function(err, drone) {
			if (err) throw err;
			
			if (drone) {
				server.drones.push(drone);
				cb(drone);
			} else {
				cb(null);
			}
		})
	} else {
		cb(drone)
	}
}

function startDrone(data) {
	getDrone(this, data, function(drone) {
		//server.proxy.proxyDrone(drone);
		drone.start();
		
		console.log("Started Drone")
		//res.send("OK")
	})
}

function stopDrone(data) {
	getDrone(this, data, function(drone) {
		drone.stop();
		
		console.log("Stopped Drone")
		//res.send("OK")
	})
}

function restartDrone(data) {
	getDrone(this, data, function(drone) {
		drone.restart();
		
		console.log("Restarted Drone");
		//res.send("OK")
	})
}

// TODO clean this up..
function assignDrone (data) {
	getDrone(this, data, function(drone) {
		var gzLoc = config.droneLocation + drone.location;
		var newLoc = config.droneLocation + drone.user.email + "/" + drone.name + "/";
	
		console.log(gzLoc);
		console.log(newLoc);
	
		fsExtra.mkdirp(config.droneLocation + drone.user.email + "/" + drone.name + "/", function (err) {
			if (err) throw err;
		
			console.log("Extracting")
			fsExtra.move(gzLoc, newLoc+"/app.tar.gz", function(err) {
				exec("cd "+newLoc+"; tar -xf "+newLoc+'/app.tar.gz && npm install', function (err, stdout, stderr) {
					console.log ("Finished extract")
					console.log(stdout);
					console.log(stderr);
				
					drone.location = newLoc;
					drone.installedOn = config.label;
					drone.isInstalled = true;
					fs.readFile(newLoc + "/package.json", function (err, data) {
						if (err) throw err;
					
						var pkg = JSON.parse(data); // mongo doesn't like dots in property names, so just strip data we [need]
						drone.pkg = {
							name: pkg.name,
							version: pkg.version,
							start: pkg.start,
							subdomain: pkg.subdomain,
							domains: pkg.domains
						};
					
						drone.save(function(err) {
							if (err) throw err;
							//res.send("OK");
						});
					})
				});
			})
		});
	});
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
				var location = config.droneLocation + user._id + "/" + repo + "/";
				var script = config.path+"/scripts/create_git_drone.sh "+location+" "+data.repo+" "+user._id+" "+config.droneLocation+user._id+"/";
				
				socket.emit('git hook response', "Creating application. Hang on.");
				
				var run = exec(script)
				run.stdout.on('data', function(data) {
					socket.emit('git hook response', data)
				})
				run.stderr.on('data', function(data) {
					socket.emit('git hook response', data)
				})
				
				run.on('close', function(code) {
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
						server.drones.push(drone);
						
						drone.parsePackage(function(err) {
							if (err) {
								socket.emit('git hook response', err);
								socket.emit('git hook end');
							
								return;
							}
						
							drone.start();
							
							socket.emit('git hook response', "Application running on PID "+drone.pid);
							socket.emit('git hook response', "Proxying to domains:");
							for (var i = 0; i < drone.domains.length; i++) {
								socket.emit('git hook response', " - "+drone.domains[i]);
							}
							socket.emit('git hook response', " - "+drone.subdomain+".nodecloud.net");
							
							socket.emit('git hook end');
							
							drone.save(function(err) {
								if (err) throw err;
								
								models.Drone.AddEvent(drone._id, "Created", "Your app was created via git");
							});
						})
					});
				})
				
				return;
			}
			
			getDrone(null, {
				id: drone._id.toString()
			}, function(drone) {
				if (!drone) {
					socket.emit('git hook response', "Sorry, App Not Found.. Apologies.");
					socket.emit('git hook end');
					return;
				}
				
				var script = config.path+"/scripts/update_drone.sh "+drone.location+" "+data.repo;
			
				var run = exec(script)
				run.stdout.on('data', function(data) {
					socket.emit('git hook response', data)
				})
				run.stderr.on('data', function(data) {
					socket.emit('git hook response', data)
				})
			
				run.on('close', function(code) {
					drone.parsePackage(function(err) {
						if (err) {
							socket.emit('git hook response', err);
							socket.emit('git hook end');
							
							drone.save()
							return;
						}
						
						socket.emit('git hook response', "Application Updated. Restarting.");
						if (drone.isRunning) {
							drone.restart();
						} else {
							drone.start();
						}
					
						socket.emit('git hook response', "Application running on PID "+drone.pid);
						socket.emit('git hook response', "Proxying to domains:");
						for (var i = 0; i < drone.domains.length; i++) {
							socket.emit('git hook response', " - "+drone.domains[i]);
						}
						socket.emit('git hook response', " - "+drone.subdomain+".nodecloud.net");
						
						drone.save();
						
						socket.emit('git hook end');
						return;
					});
				})
			})
		})
	});
}