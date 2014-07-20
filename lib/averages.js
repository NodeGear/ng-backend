var os = require('os');
var fs = require('fs');
var async = require('async');

var backend = require('./backend');
var server = backend.server;
var client = backend.redis_client;
var ProcessManager = require('./ProcessManager');
var httpRequest = require('./request').httpRequest;

var old = null;

var num_cpus = 1;

function load () {
	calcSysLoad();

	var ps = ProcessManager.getProcesses();
	console.log('Getting for ', ps.length, 'processes');
	for (var i = 0; i < ps.length; i++) {
		calcProcessLoad(ps[i]);
	}
}

function calcProcessLoad (process) {
	if (!process.running || !process.container) {
		return;
	}

	var monitor = {};

	// Call docker for top.. it does `ps` command in the container
	var data = '';
	
	httpRequest()
	.get('/v1.13/containers/'+process.container+'/top?ps_args=aux')
	.onData(function (chunk) {
		console.log(chunk);
		data += chunk;
	})
	.run(function (status) {
		console.log('Got', status);
		if (status != 200) {
			return;
		}

		try {
			var json = JSON.parse(data);
			console.log(json);
			var cpuIndex = json.Titles.indexOf('%CPU');
			var memIndex = json.Titles.indexOf('RSS');

			if (cpuIndex == -1 || memIndex == -1) {
				return;
			}

			var cpuPercent = 0;
			var memRSS = 0;
			for (var i = 0; i < json.Processes.length; i++) {
				cpuPercent += parseFloat(json.Processes[i][cpuIndex]);
				memRSS += parseFloat(json.Processes[i][memIndex]);
			}

			monitor.cpu_percent = cpuPercent;
			monitor.cpu_percent_max = 100;
			monitor.rss = memRSS;
			monitor.rss_max = server.app_memory * 1024; // its in MB, rss in KB

			console.log(monitor);

			client.publish('process_stats', JSON.stringify({
				_id: process._id,
				app: process.app_id,
				monitor: monitor
			}));
		} catch (e) {
			console.log("Something went wrong when getting cpu,mem usage for Process", process.container, e);
		}
	});
}

function calcSysLoad () {
	var stats = cpuInfo();

	if (old == null) {
		old = stats;
		return;
	}

	var sub = {
		cores: stats.cores,
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

	num_cpus = cpus.length;

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
		sys: sys,
		cores: cpus.length
	};
}

setInterval(load, 1000);