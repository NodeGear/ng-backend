var http = require('http')
	, path = require('path')
	, mongoose = require('mongoose')
	, fs = require('fs')
	, util = require('util')
	, events = require('events')
	, config = require('../lib/config')
	, bugsnag = require('bugsnag')
	, redis = require("redis")
	, models = require('ng-models').init(mongoose, config)

mongoose.connect(config.db, config.db_options);

if (!process.env.NG_TEST) {
	bugsnag.register("c0c7568710bb46d4bf14b3dad719dbbe", {

	});
}

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
});

var client = redis.createClient();
if (config.env == 'production') {
	client.auth("ahShii3ahyoo0OhJa1ooG4yoosee8me9EvahW0ae")
}

module.exports = new (function() {
	var self = this;
	self.ready = false;

	self.redis_client = client;

	models.Server.findOne({
		identifier: config.serverid
	}, function(err, server) {
		if (err) throw err;

		if (!server) {
			// Create myself
			server = new models.Server({
				name: "Localhost Server",
				location: "Home",
				identifier: config.serverid
			});
			server.save();
		}

		self.server = server;

		self.boot();
	});

	self.boot = function() {
		var Proxy = require('./balancer/Proxy').Proxy
			, routes = require('./routes')
			, ProcessManager = require('./ProcessManager')

		self.ready = true;
		
		routes.router(client);

		self.proxy = new Proxy();

		// Restore apps from Database
		ProcessManager.fetchProcesses();
	}
})()