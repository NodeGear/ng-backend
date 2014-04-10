var http = require('http')
	, path = require('path')
	, mongoose = require('mongoose')
	, fs = require('fs')
	, util = require('util')
	, events = require('events')
	, config = require('../lib/config')
	, bugsnag = require('bugsnag')
	, redis = require("redis")

mongoose.connect(config.db, config.db_options);

bugsnag.register("c0c7568710bb46d4bf14b3dad719dbbe");

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
});

var client = self.redis_client = redis.createClient();
if (config.env == 'production') {
	client.auth("ahShii3ahyoo0OhJa1ooG4yoosee8me9EvahW0ae")
}

// Main event emitter bus
var server = function () {
	var self = this;

	process.nextTick(function() {
		require('../lib/backend')(self);
	})
}

util.inherits(server, events.EventEmitter);

exports = module.exports = new server();