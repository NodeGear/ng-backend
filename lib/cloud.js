var cloud;
var express = require('express')
	, http = require('http')
	, path = require('path')
	, config = require('./config')
	, mongoose = require('mongoose')
	, fs = require('fs')
	, dronemodel = require('./drone/model')

function Cloud() {
	this.processes = [];
}

require('util').inherits(Cloud, require('events').EventEmitter);

Cloud.prototype.setup = function () {
	cloud.app = app = express();
	
	fs.readFile(__dirname + "/../package.json", function(err, pkg) {
		if (err) throw err;
		
		cloud.version = pkg.version;
	})
	
	// all environments
	app.set('port', config.port);
	app.use(express.logger('dev'));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(app.router);
	
	// development only
	if ('development' == app.get('env')) {
		app.use(express.errorHandler());
	}
	
	var api = require('./api')
	api.router(app);
	
	cloud.server = http.createServer(app)
	cloud.io = require('socket.io').listen(cloud.server)
	
	api.socketRouter(cloud.io)
	
	cloud.server.listen(app.get('port'), function() {
		mongoose.connect(config.db)
		console.log('Listening '+config.api+':'+config.port);
		
		// Restore drones
		dronemodel.find({
		}, function(err, drones) {
			if (err) throw err;
			
			console.log("Restoring drones")
			console.log(drones)
			
			for (var i = 0; i < drones.length; i++) {
				var model = drones[i];
				var drone = new Drone({
					model: model
				})
				if (model.isRunning == true) {
					drone.start(function() {
						console.log("Restored drone accesible on "+drone.pkg.subdomain)
					})
				}
			}
		});
	});
	
	var Drone = require('./drone/drone')
		, Proxy = require('./balancer/proxy')
	cloud.proxy = new Proxy()
}

module.exports = cloud = new Cloud();

cloud.setup()