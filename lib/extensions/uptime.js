var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, async = require('async')
	, exec = require('child_process').exec
	, spawn = require('child_process').spawn
	, backend = require('../backend')
	, config = require('../config')
	, models = require('ng-models')
	, client = backend.redis_client
	, fs = require('fs');

exports.stack = function (Process) {
	[
		'getUptime',
		'createUptime'
	].forEach(function (method) {
		Process.prototype[method] = exports[method];
	});
}

exports.getUptime = function(cb) {
	var self = this;

	if (!self.uptime) {
		// Make it.
		var uptime = self.createUptime();

		cb(uptime);

		return;
	}

	models.AppProcessUptime.findOne({
		_id: self.uptime
	}, function(err, uptime) {
		if (err) throw err;

		if (!uptime) {
			uptime = self.createUptime();
		}

		cb(uptime);
	})
}

exports.createUptime = function() {
	var self = this;

	var uptime = new models.AppProcessUptime({
		app: self.app_id,
		process: self._id,
		server: backend.server._id,
		price_per_hour: backend.server.price_per_hour
	});
	uptime.save();

	uptime.setUser();

	self.uptime = uptime._id;

	return uptime;
}