var http = require('http')
	, path = require('path')
	, mongoose = require('mongoose')
	, fs = require('fs')
	, util = require('util')
	, events = require('events')
	, io = require('socket.io')
	, config = require('./config')

mongoose.connect(config.db, config.db_options)

var db = mongoose.connection
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
});

var server = function () {
	var self = this;
	
	self.drones = [];
	
	self.start = function() {
		var models = require('./models')
			, Proxy = require('./balancer/Proxy').Proxy
			, routes = require('./routes')
		
		io = io.listen(9049)

		io.sockets.on('connection', function(socket) {
			routes.router(socket);
		});
		
		io.set('log level', 1);
		
		console.log('Listening :'+config.port);
		console.log('Label: '+config.label)

		self.proxy = new Proxy()
		
		// Restore drones from Database
		models.Drone.find({
			isRunning: true,
			isInstalled: true,
			installedOn: config.label
		}).populate('user').exec(function(err, drones) {
			if (err) throw err;

			for (var i = 0; i < drones.length; i++) {
				//self.proxy.proxyDrone(drones[i]);
				drones[i].start();

				self.drones.push(drones[i]);
			}
		})
	}
}

util.inherits(server, events.EventEmitter);

if (process.env.RUN_SERVER !== "false") {
	exports = module.exports = new server();
	
	exports.start();
}