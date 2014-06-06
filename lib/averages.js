var os = require('os');

var backend = require('./backend');
var server = backend.server;
var client = backend.redis_client;

var old = null;

function load () {
	var stats = cpuInfo();

	if (old == null) {
		old = stats;
		return;
	}

	var sub = {
		total: stats.total - old.total,
		idle: stats.idle - old.idle,
		user: stats.user - old.user,
		sys: stats.sys - old.sys,
		memTotal: os.totalmem(),
		memFree: os.freemem(),
		identifier: server.identifier
	};
	sub.free = sub.idle / sub.total;
	sub.mem = sub.memFree / sub.memTotal;

	old = stats;

	//console.log(Math.round((1 - sub.free) * 100) + "% Load\t" + Math.round(100 * (sub.user / sub.total)) + "% User\t" + Math.round(100 * (sub.sys / sub.total)) + "% Sys\t" + Math.round(100 * sub.mem) + "% Used RAM");

	client.publish('server_stats', JSON.stringify(sub));
}

function cpuInfo () {
	var cpus = os.cpus();

	var total = 0, idle = 0, user = 0, sys = 0;
	
	for (var cpu in cpus) {
		var t = cpus[cpu].times;
		
		total += t.idle + t.user + t.sys + t.irq + t.nice;
		idle += t.idle;
		user += t.user;
		sys += t.sys;
	}

	return {
		total: total,
		idle: idle,
		user: user,
		sys: sys
	};
}

setInterval(load, 1000);