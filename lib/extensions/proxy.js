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
		if (domains.length == 0) {
			self.processOutput("\n No Domains Set, your app won't be accessible! Stopping app.\n");
			models.AppEvent.AddEvent(self._id, self.app_id, "Start Error", "App Could not be Started because it has not defined any domains.");
			self.stop();

			return;
		}

		async.each(domains, function (domain, cb) {
			client.multi()
			.hmset('proxy:domain_details_' + domain.domain, {
				ssl: domain.ssl,
				ssl_only: domain.ssl_only,
				owner: domain.user
			})
			.sadd('proxy:domain_members_' + domain.domain, JSON.stringify({
				extra: self._id,
				owner: domain.user,
				hostname: backend.server.location,
				port: self.port
			}))
			.exec(function (err) {
				cb(err);
			});
		}, function (err) {
			if (err) throw err;
		});
	});
}

exports.removeFromProxy = function() {
	var self = this;

	models.AppDomain.find({
		app: self.app_id
	}, function(err, domains) {

		async.each(domains, function (domain, cb) {
			var membersKey = 'proxy:domain_members_' + domain.domain;
			
			client.multi()
			.srem(membersKey, member)
			.smembers(membersKey)
			.exec(function (err, results) {
				if (err || results.length != 2) {
					throw err;
				}

				var members = results[1];

				var delMulti = client.multi();

				for (var i = 0; i < members.length; i++) {
					var m = JSON.parse(members[i]);
					if (m.owner != domain.user) {
						// Delete this member
						delMulti.srem(membersKey, members[i])
					}
				}

				delMulti.exec(function (err) {
					if (err) throw err;
				});

				if (members.length == 0) {
					// Remove the domain
					s.multi()
					.del(membersKey)
					.del('proxy:domain_details_' + domain.domain)
					.exec(function (err) {
						if (err) {
							throw err;
						}

						cb();
					});
				} else {
					cb();
				}
			});
		});
	});
}