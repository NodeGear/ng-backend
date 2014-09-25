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
	, stringDecoder = new (require('string_decoder').StringDecoder)('utf-8')
	, fs = require('fs');

exports.stack = function (Process) {
	[
		'processOutput'
	].forEach(function (method) {
		Process.prototype[method] = exports[method];
	});
}

exports.processOutput = function(chunk, prefix) {
	var self = this;

	if (typeof prefix === 'undefined') prefix = '';

	var string = chunk;
	if (typeof chunk !== 'string') {
		string = stringDecoder.write(chunk);
	}

	string = prefix+string;

	if (process.env.NG_TEST || process.env.NODE_ENV != 'production') {
		process.stdout.write(string)
	}

	if (this.inserted_log_to_redis != true) {
		this.inserted_log_to_redis = true;
		client.lpush('pm:app_process_logs_'+self._id, self.current_log);
		client.publish("pm:app_log_new", self._id);
	}

	client.lpush('pm:app_process_log_'+self.current_log, string);
	client.publish("pm:app_log_entry", self._id+'|'+string);
}