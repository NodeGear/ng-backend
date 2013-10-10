var cloud = require('../cloud')
	, models = require('../models')
	, config = require('../config')
	, fsExtra = require('fs.extra')
	, tar = require('tar.gz')

exports.router = function (app) {
	app.get('/drones', listDrones);
		.get('/assign/:id', getDrone, assignDrone)
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

function assignDrone (req, res) {
	var drone = res.params.drone;
	var gzLoc = config.droneLocation + drone.location;
	var newLoc = config.droneLocation + drone.user.email + "/" + drone.name + "/";
	
	console.log(gzLoc);
	console.log(newLoc);
	
	fsExtra.mkdirp(config.droneLocation + drone.user.email + "/" + drone.name + "/", function (err) {
		if (err) throw err;
		
		console.log("Extracting")
		new tar().extract(gzLoc, newLoc, function (err) {
			if (err) throw err;
			
			console.log ("Finished extract")
			
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
	});
}