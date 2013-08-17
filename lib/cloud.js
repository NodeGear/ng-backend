var express = require('express')
	, http = require('http')
	, path = require('path')
	, events = require('events')
	, util = require('util')
	, Drone = require('./drone/drone')
	, Proxy = require('./balancer/proxy')
	, config = require('./config')
	, mongoose = require('mongoose')
	, fs = require('fs')

var Cloud = function Cloud() {
	this.app = app = express();
	
	var self = this;
	
	fs.readFile(__dirname + "/../package.json", function(err, pkg) {
		if (err) throw err;
		
		self.version = pkg.version;
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
	
	var api = require('./api')(app)
	
	http.createServer(app).listen(app.get('port'), function() {
		mongoose.connect(config.db)
		console.log('Listening '+config.hostname+':'+config.port);
	});
}

util.inherits(Cloud, events.EventEmitter);

module.exports = new Cloud();
module.exports.proxy = new Proxy()

module.exports.drones = [];
module.exports.on('drone:data', function(drone, data) {
	for (var i = 0; i < module.exports.drones.length; i++) {
		var d = module.exports.drones[i];
		if (d == drone) {
			// Send the data to the connection of the drone.
			// TODO check connection is live
			// TODO implement drones into mongoose
			drone.connection.send(data);
			break;
		}
	}
})