var cloud = require('../cloud')
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
}

function listDrones (req, res) {
	var drones = cloud.drones;
	res.send(drones);
}

function getDrone(req, res, next) {
	var id = req.params.id;
	
	var drones = cloud.drones;
	
	var found = false;
	for (var i = 0; i < drones.length; i++) {
		if (drones[i]._id.equals(mongoose.Types.ObjectId(id))) {
			found = true;
			res.locals.drone = drones[i];
			break;
		}
	}
	
	if (!found) {
		models.Drone.findById(id).populate('user').exec(function(err, drone) {
			if (err) throw err;
		
			res.locals.drone = drone;
			cloud.drones.push(drone);
			next();
		})
	} else {
		next()
	}
}

function startDrone(req, res) {
	var drone = res.locals.drone;
	
	//cloud.proxy.proxyDrone(drone);
	drone.start();
	
	res.send("OK")
}

function stopDrone(req, res) {
	res.locals.drone.stop();
	
	res.send("OK")
}

function restartDrone(req, res) {
	res.locals.drone.restart();
	
	res.send("OK")
}

// TODO clean this up..
function assignDrone (req, res) {
	var drone = res.locals.drone;
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
						res.send("OK");
					});
				})
			});
		})
	});
}