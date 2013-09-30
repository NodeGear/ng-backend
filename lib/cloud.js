var express = require('express')
	, http = require('http')
	, path = require('path')
	, config = require('./config')
//	, mongoose = require('mongoose')
	, fs = require('fs')
//	, models = require('./models')
	, util = require('util')
	, Drone = require('./drone/Drone').Drone
	, Proxy = require('./balancer/Proxy').Proxy

exports.app = (function Cloud() {
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
	
	this.server = http.createServer(app)
	
	this.server.listen(app.get('port'), function() {
		
		//mongoose.connect(config.db)
		console.log('Listening :'+config.port);
		console.log("Starting proxy")
		
		self.proxy = new Proxy()
		
		var d = new Drone({
			pkg: {
				name: "testapp",
				start: "test.js",
				domains: ["testapp.local"]
			}
		});
		
		self.proxy.proxyDrone(d);
		
		d.start();
	});
})();