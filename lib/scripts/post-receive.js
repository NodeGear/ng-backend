#!/usr/local/bin/node

process.env.RUN_NODECLOUD = false;

var config = require('../config')
var models = require('../models')
var exec = require('child_process').exec
var mongoose = require('mongoose')

mongoose.connect(config.db)
var db = mongoose.connection
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
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
		
		if (!drone) {
			// Create a new one
			drone = new models.Drone({
				name: repo,
				location: config.droneLocation + user.email + "/" + repo + "/",
				user: user._id,
				isInstalled: true,
				installedOn: config.label
			})
			drone.save();
			
			process.env.DRONE_LOCATION = drone.location;
			var create = exec(__dirname+"/create_git_drone.sh")
			create.stdout.on('data', function(data) {
				console.log(data)
			})
			create.stderr.on('data', function(data) {
				console.log(data)
			})
			create.on('close', function(code) {
				console.log("Creating drone exit with "+code)
			})
			
			return;
		}
		
		process.env.DRONE_LOCATION = drone.location;
		var update = exec(__dirname+"/update_drone.sh")
		update.stdout.on('data', function(data) {
			console.log(data)
		})
		update.stderr.on('data', function(data) {
			console.log(data)
		})
		update.on('close', function(code) {
			console.log("Update drone exit with "+code)
		})
	})
})