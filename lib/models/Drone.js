var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
	, fs = require('fs.extra')
	, async = require('async')
	, exec = require('child_process').exec
	, forever = require('forever-monitor')
	, server = require('../server')
	, config = require('../config')
	, usage = require('usage')
	, npm = require('npm')
	, Event = require('./Event')

var droneSchema = schema({
	name: String,
	user: {
		type: ObjectId,
		ref: "User"
	},
	deleted: { type: Boolean, default: false },
	location: String,
	isRunning: Boolean,
	isRestarting: { type: Boolean, default: false },
	isInstalled: { type: Boolean, default: false },
	installedOn: String, // label of the nodecloud instance looking after this drone
	pid: Number,
	logs: [{
		created: Date,
		location: String
	}],
	env: [{
		name: String,
		value: String,
		created: { type: Date, default: Date.now() },
	}],
	events: [{
		type: ObjectId,
		ref: 'Event'
	}],
	domains: [String],
	subdomain: String,
	script: String,
	processes: { type: Number, default: 1, min: 1 }
})

droneSchema.methods.parsePackage = function (cb) {
	if (!cb) cb = function() {}
	var self = this;
	
	fs.exists(self.location+"package.json", function(exists) {
		if (exists) {
			fs.readFile(self.location+"package.json", function(err, json) {
				try {
					var pkg = JSON.parse(json);
					
					if (typeof pkg.start === 'string' && pkg.start.length > 0) {
						self.script = pkg.start;
					} else {
						throw new Error("package.json must contain start: 'script.js'")
					}
					
					// TODO check for used subdomains
					var domains = [];
					for (var i = 0; i < pkg.domains.length; i++) {
						if (typeof pkg.domains[i] === 'string') domains.push(pkg.domains[i]);
					}
					
					self.domains = domains;
					self.subdomain = pkg.subdomain;
					
					if (self.subdomain.length == 0) {
						self.subdomain = self._id+"."+self.user._id;
					}
				} catch (ex) {
					cb("package.json malformed! "+ex.message)
					return;
				}
				
				cb(null);
			})
		} else {
			cb("package.json does not exist!");
		}
	})
}

droneSchema.statics.AddEvent = function (id, title, desc) {
	module.exports.findById(id).select('events').exec(function(err, drone) {
		if (err || !drone) return;
		
		ev = new Event({
			name: title,
			message: desc
		});
		ev.save()
		
		drone.events.push(ev)
		drone.save()
	});
}

module.exports = mongoose.model("Drone", droneSchema);