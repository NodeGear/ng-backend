var cloud = require('../cloud')
	, models = require('../models')
	, config = require('../config')
	, fs = require('fs')
	, fsExtra = require('fs.extra')
	, tar = require('tar.gz')
	, exec = require('child_process').exec

exports.router = function (app) {
	app.get('/drones', listDrones)
		.get('/assign/:id', getDrone, assignDrone)
		.get('/start/:id', getDrone, startDrone)
}

function listDrones (req, res) {
	var drones = cloud.app.drones;
	res.send(drones);
}

function getDrone(req, res, next) {
	var id = req.params.id;
	
	models.Drone.findById(id).populate('user').exec(function(err, drone) {
		if (err) throw err;
		
		res.locals.drone = drone;
		next();
	})
}

function startDrone(req, res) {
	var drone = res.locals.drone;
	
	cloud.app.proxy.proxyDrone(drone);
	drone.start();
	
	res.send("OK")
}

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
					
					drone.pkg = JSON.parse(data);
					
					drone.save();
					res.send("OK");
				})
			});
		})
	});
}