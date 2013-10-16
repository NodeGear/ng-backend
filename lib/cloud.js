var express = require('express')
	, http = require('http')
	, path = require('path')
	, config = require('./config')
	, mongoose = require('mongoose')
	, fs = require('fs')
	, models = require('./models')
	, util = require('util')
	, Proxy = require('./balancer/Proxy').Proxy
	, routes = require('./routes')

exports.app = new (function Cloud() {
	var self = this;
	this.drones = [];

	this.app = app = express();

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

	routes.router(app);

	this.server = http.createServer(app)

	this.server.listen(app.get('port'), function() {
	
		mongoose.connect(config.db)
		var db = mongoose.connection
		db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
		db.once('open', function callback () {
			console.log("Mongodb connection established")
		});
		
		console.log('Listening :'+config.port);
		console.log('Label: '+config.label)
	
		self.proxy = new Proxy()
	
		// Restore drones from Database
		models.Drone.find({
			isRunning: true,
			isInstalled: true,
			installedOn: config.label
		}, function(err, drones) {
			if (err) throw err;
	
			for (var i = 0; i < drones.length; i++) {
				//self.proxy.proxyDrone(drones[i]);
				drones[i].start();
		
				self.drones.push(drones[i]);
			}
		})
	});
})();