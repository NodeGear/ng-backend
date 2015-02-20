var http = require('http'),
	path = require('path'),
	mongoose = require('mongoose'),
	fs = require('fs'),
	util = require('util'),
	events = require('events'),
	config = require('../lib/config'),
	bugsnag = require('bugsnag'),
	redis = require("redis"),
	client = redis.createClient(config.credentials.redis_port, config.credentials.redis_host),
	models = require('ng-models').init(mongoose, config, {
		redis: client
	}),
	logtrail = require('logtrail');

mongoose.connect(config.credentials.db, config.credentials.db_options);

if (config.credentials.redis_key.length > 0) {
	client.auth(config.credentials.redis_key)
}

var opts = {};
if (process.env.NG_TEST) {
	opts.autoNotifyUncaught = false;
	opts.onUncaughtError = function (err) {}
}

bugsnag.register(config.credentials.bugsnag_key, opts);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	logtrail.info("Mongodb connection established");
});

module.exports = new (function () {
	var self = this;
	self.ready = false;

	self.bus = new events.EventEmitter();

	self.redis_client = client;

	models.Server.findOne({
		identifier: config.credentials.server.id
	}, function (err, server) {
		if (err) throw err;

		if (!server) {
			// I GOD, Me Creates Itself ... But someone must have created this god, right?
			logtrail.warn('Creating new server', config.credentials.server.identifier);

			server = new models.Server({
			});
			self.redis_client.set('backend_port:'+config.credentials.server.id, 9000);
		}

		server.name = config.credentials.server.name;
		server.location = config.credentials.server.address;
		server.identifier = config.credentials.server.id;
		server.price_per_hour = config.credentials.server.price;
		server.app_memory = config.credentials.server.app_memory;

		server.save();
		
		self.server = server;
		logtrail.info('server ~>', server);

		self.boot();
	});

	self.boot = function() {
		logtrail.trace('Enter boot()');

		var routes = require('./routes'),
			ProcessManager = require('./ProcessManager'),
			averages = require('./averages');

		self.ready = true;
		
		routes.router(client);
		
		// Restore apps from Database
		ProcessManager.fetchProcesses();
		require('./dockerDaemon');
	}
})();
