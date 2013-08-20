var Drone = require('../drone/drone')
	, exec = require('child_process').exec
	, User = require('../authentication/user').User
	, async = require('async')
	, cloud = require('../cloud')
	, fs = require('fs.extra')
	, config = require('../config')
	, targz = require('tar.gz')
	, api = require('./index')

// Creating drones happens like this:
/*
1. User logs in and obtains token into their ~/.nodecloud
2. User goes to the desired app folder
3. deploy command
4. Local check of the package.json
5. Checks availability of subdomain, version (if it exists)
6. Uploads the package & token & tar.gz
7. Connects to websocket sending the package & token
8. Tells the server to start the app
9. Server streams the log of data through the websocket

// FUTURE TODO Should have deploy command, upload, list, remove, start/stop/restart, log, tail!
 */

exports.listDrones = function (req, res) {
	
}

exports.uploadDrone = function (req, res) {
	var user = req.user;
	
	var pkg = JSON.parse(req.body.package);
	
	if (req.files.drone) {
		var name = req.files.drone.name;
		var dir = config.tmp+Date.now()+'/';
		var target = dir+name;
		
		async.series([
			function(cb) {
				fs.mkdirp(dir, cb)
			},
			function(cb) {
				fs.move(req.files.drone.path, target, cb)
			},
			function(cb) {
				new targz().extract(target, dir, cb)
			},
			function(cb) {
				fs.rmrf(target, cb)
			}
		], function(err) {
			if (err) throw err;
			
			drone = new Drone({
				pkg: pkg,
				user: user,
				repository: {
					path: dir,
					type: 'local'
				},
				connection: res
			})
			api.attachDrone(user, drone)
		})
	}
	
	res.send({
		status: "Uploaded"
	})
}

exports.start = function (req, res) {
	
	
	drone.start(function(proc) {
		opts.connection.write("Drone accesible on "+drone.pkg.subdomain)
		for (var i = 0; i < drone.pkg.domains.length; i++) {
			res.write(" - "+drone.pkg.domains[i]);
		}
	})
}


exports.createDrone = function (req, res) {
}