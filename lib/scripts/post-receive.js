#!/usr/local/bin/node

process.env.RUN_NODECLOUD = false;

var config = require('../config')
var models = require('../models')
var exec = require('child_process').exec
var mongoose = require('mongoose')

mongoose.connect(config.db)
var db = mongoose.connection
db.on('error', console.error.bind(console, 'Database Connection Error:'));
db.once('open', function callback () {
//	console.log("Mongodb connection established")
});

var gl_user = process.env.GL_USER;
var gl_repo = process.env.GL_REPO;

// Find if our user exists
models.User.findById(gl_user, function(err, user) {
	if (err) throw err;
	
	var repo_split = gl_repo.split('/');
	if (repo_split.length != 2) {
		console.log("Invalid repository")
		return;
	}
	
	var repo = repo_split[1];
	
	models.Drone.findOne({
		user: user._id,
		name: repo
	}, function(err, drone) {
		if (err) throw err;
		
		var script = __dirname+"/update_drone.sh";
		var created = false;
		if (!drone) {
			created = true;
			
			// Create a new one
			drone = new models.Drone({
				name: repo,
				location: config.droneLocation + user.email + "/" + repo + "/",
				user: user._id,
				isInstalled: true,
				installedOn: config.label
			})
			drone.save();
			
			script = __dirname+"/create_git_drone.sh"
		}
		
		process.env.DRONE_LOCATION = drone.location;
		
		var run = exec(script)
		if (process.env.NODE_ENV == 'development') {
			run.stdout.on('data', function(data) {
				console.log(data)
			})
			run.stderr.on('data', function(data) {
				console.log(data)
			})
		}
		
		run.on('close', function(code) {
			drone.parsePackage(function(err) {
				if (err) {
					console.log("Failed to Update app: "+err);
					process.exit(1)
				}
				
				drone.installDependencies(function(err) {
					if (err) {
						console.log("Failed to install npm dependencies" + err);
						process.exit(1);
					}
					
					if (created) {
						console.log("Created a new app called "+repo)
					} else {
						console.log("Updated "+repo)
					}
					
					process.exit(0)
				})
			})
		})
	})
})