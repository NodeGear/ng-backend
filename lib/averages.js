var os = require('os');
var fs = require('fs');
var async = require('async');

var backend = require('./backend');
var server = backend.server;
var client = backend.redis_client;
var ProcessManager = require('./ProcessManager');

var old = null;

var num_cpus = 1;

function load () {
	calcSysLoad();

	var ps = ProcessManager.getProcesses();
	for (var i = 0; i < ps.length; i++) {
		calcProcessLoad(ps[i]);
	}
}

function calcProcessLoad (process) {
	if (!process.running || !process.process) {
		return;
	}

	var monitor = {};

	async.parallel([
		function (done) {
			// CPU
			fs.readFile('/proc/'+process.process.child.pid+'/stat', function(err, data) {
				var cpu = data.toString().split(' ');
				monitor.cpu_utime = parseInt(cpu[13]);
				monitor.cpu_stime = parseInt(cpu[14]);
				monitor.cpu_time = monitor.cpu_utime + monitor.cpu_stime;

				done();

				/*
					utime %lu   (14)
						Amount of time that this process has been
						scheduled in user mode, measured in clock ticks
						(divide by sysconf(_SC_CLK_TCK)).  This includes
						guest time, guest_time (time spent running a
						virtual CPU, see below), so that applications that
						are not aware of the guest time field do not lose
						that time from their calculations.

					stime %lu   (15)
						Amount of time that this process has been
						scheduled in kernel mode, measured in clock ticks
						(divide by sysconf(_SC_CLK_TCK)).
				*/

			});
		},
		function (done) {
			// Memory
			fs.readFile('/proc/'+process.process.child.pid+'/statm', function(err, data) {
				/*
					size       (1) total program size
							 (same as VmSize in /proc/[pid]/status)
					resident   (2) resident set size
							 (same as VmRSS in /proc/[pid]/status)
					share      (3) shared pages (i.e., backed by a file)
					text       (4) text (code)
					lib        (5) library (unused in Linux 2.6)
					data       (6) data + stack
					dt         (7) dirty pages (unused in Linux 2.6)
				*/

				var mem = data.toString().split(' ');
				monitor.mem_total = parseFloat(mem[0]) * 4096 / 1024;
				monitor.rss = parseFloat(mem[1]) * 4096 / 1024;

				done();
			});
		}
	], function (err) {
		if (!process.monitor) {
			process.monitor = monitor;
			return;
		}

		// https://stackoverflow.com/questions/7773826/how-to-find-out-the-cpu-usage-for-node-js-process
		var delta = monitor.cpu_time - process.monitor.cpu_time;
		monitor.cpu_percent = delta;

		process.monitor = monitor;

		client.publish('process_stats', JSON.stringify({
			_id: process._id,
			app: process.app_id,
			monitor: monitor
		}));
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