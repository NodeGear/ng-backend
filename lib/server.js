var http = require('http')
	, path = require('path')
	, mongoose = require('mongoose')
	, fs = require('fs')
	, util = require('util')
	, events = require('events')
	, config = require('./config')
	, bugsnag = require('bugsnag')
	, redis = require("redis")

mongoose.connect(config.db, config.db_options);

bugsnag.register("c0c7568710bb46d4bf14b3dad719dbbe");

var db = mongoose.connection
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
});

var server = function () {
	var self = this;
	
	self.start = function() {
		var client = self.redis_client = redis.createClient();
		
		var models = require('./models')
			, Proxy = require('./balancer/Proxy').Proxy
			, routes = require('./routes')
			, ProcessManager = require('./models/ProcessManager')
		
		console.log('Label: '+config.label)
		
		routes.router(client);
		
		self.proxy = new Proxy()
		
		// Restore drones from Database
		models.Drone.find({
			isRunning: true,
			isInstalled: true,
			installedOn: config.label
		}).populate('user').exec(function(err, drones) {
			if (err) throw err;
			
			for (var i = 0; i < drones.length; i++) {
				var process = ProcessManager.manageProcess(drones[i]);
				process.start()
			}
		})
	}
}

util.inherits(server, events.EventEmitter);

if (process.env.RUN_SERVER !== "false") {
	exports = module.exports = new server();
	
	exports.start();
}