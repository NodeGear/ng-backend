var express = require('express')
	, http = require('http')
	, path = require('path')
	, config = require('./config')
	, mongoose = require('mongoose')
	, fs = require('fs')
	, models = require('./models')
	, EventEmitter = require('events').EventEmitter
	, util = require('util')
	, Drone = require('./drone/drone')
	, Proxy = require('./balancer/Proxy')
	, api = require('./api')

exports.Cloud = function Cloud() {
	var self = this;
	this.processes = [];
	
	this.app = express();
	
	// all environments
	app.enable('trust proxy');
	app.set('port', config.port);
	app.use(express.logger('dev'));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(app.router);
	
	// development only
	if ('development' == app.get('env')) {
		app.use(express.errorHandler());
	}
	
	api.router(app);
	
	this.server = http.createServer(app)
	
	cloud.server.listen(app.get('port'), function() {
		
		mongoose.connect(config.db)
		console.log('Listening '+config.api+':'+config.port);
		console.log("Starting proxy")
		
		self.proxy = new Proxy(function() {
			// Restore drones
			models.Drone.getDrones(function (drones) {
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
			
		})
	});
}

util.inherits(exports.Cloud, EventEmitter);

exports.cloud = new exports.Cloud;