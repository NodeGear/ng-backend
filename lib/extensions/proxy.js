var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, async = require('async')
	, exec = require('child_process').exec
	, spawn = require('child_process').spawn
	, forever = require('forever-monitor')
	, backend = require('../backend')
	, config = require('../config')
	, models = require('ng-models')
	, client = backend.redis_client
	, fs = require('fs');

exports.stack = function (Process) {
	[
		'addToProxy',
		'removeFromProxy'
	].forEach(function (method) {
		Process.prototype[method] = exports[method];
	});
}

exports.addToProxy = function() {
	var self = this;

	models.AppDomain.find({
		app: self.app_id
	}, function(err, domains) {
		var doms = {};

		for (var i = 0; i < domains.length; i++) {
			var domain = domains[i];

			doms[domain.domain] = self.app_id;
		}

		if (domains.length == 0) {
			self.processOutput("\n No Domains Set, your app won't be accessible! Stopping app.\n");
			models.AppEvent.AddEvent(self._id, self.app_id, "Start Error", "App Could not be Started because it has not defined any domains.");
			self.stop();

			return;
		}
		
		client.hmset('proxy:domains', doms, function(err) {
			if (err) throw err;
		});

		client.sadd('proxy:app_'+self.app_id, self._id, function(err) {
			if (err) throw err;
		});

		client.hmset('proxy:app_process_'+self._id, {
			hostname: backend.server.location,
			port: self.port
		}, function(err) {
			if (err) throw err;
		});
	});
}

exports.removeFromProxy = function() {
	var self = this;

	client.del('proxy:app_process_'+self._id);

	client.smembers('proxy:app_'+self.app_id, function(err, processes) {
		if (err) throw err;

		client.srem('proxy:app_'+self.app_id, self._id);
		
		if (processes.length > 1) {
			return;
		}

		client.hgetall('proxy:domains', function(err, domains) {
			if (err) throw err;

			var to_delete = [];
			for (dom in domains) {
				if (!domains.hasOwnProperty(dom)) {
					continue;
				}

				var app_id = domains[dom];
				if (app_id == self.app_id) {
					// Remove this domain.
					to_delete.push(dom);
				}
			}

			if (to_delete.length == 0) {
				// Would throw an exception
				return;
			}

			// HDEL takes an array as argument, therefore the first in that array has to be the key of the table.
			to_delete.splice(0, 0, 'proxy:domains');

			client.hdel(to_delete, function(err) {
				if (err) throw err;
			});
		});
	});
}