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
	.get('/v1.13/containers/'+process.container+'/top')
	.onData(function (chunk) {
		data += chunk;
	})
	.run(function (status) {
		if (status != 200) {
			return;
		}

		try {
			var json = JSON.parse(data);
			var pidIndex = json.Titles.indexOf('PID');

			if (pidIndex == -1) {
				return;
			}

			var pids = [];
			for (var i = 0; i < json.Processes.length; i++) {
				pids.push(json.Processes[i][pidIndex]);
			}

			calcProcessLoadForPids(process, pids);
		} catch (e) {
			console.log("Something went wrong when getting cpu,mem usage for Process", process.container, e);
		}
	});
}

function calcProcessLoadForPids (process, pids) {
	async.map(pids, function (pid, cb) {
		var pid_monitor = {};

		async.parallel([
			function (done) {
				// CPU
				fs.readFile('/outside_proc/'+pid+'/stat', function(err, data) {
					if (err || !data) {
						pid_monitor.cpu_utime = 0;
						pid_monitor.cpu_stime = 0;
						pid_monitor.cpu_time = 0;

						return done();
					}

					var cpu = data.toString().split(' ');
					pid_monitor.cpu_utime = parseInt(cpu[13]);
					pid_monitor.cpu_stime = parseInt(cpu[14]);
					pid_monitor.cpu_time = pid_monitor.cpu_utime + pid_monitor.cpu_stime;

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
				fs.readFile('/outside_proc/'+pid+'/statm', function(err, data) {
					if (err || !data) {
						pid_monitor.rss = 0;
						return done();
					}
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
					//pid_monitor.mem_total = parseFloat(mem[0]) * 4096 / 1024;
					pid_monitor.rss = parseFloat(mem[1]) * 4096 / 1024;

					done();
				});
			}
		], function (err) {
			cb(null, pid_monitor);
		});
	}, function (err, pid_monitors) {
		// Add the monitors up
		var monitor = {
			rss: 0,
			cpu_utime: 0,
			cpu_stime: 0,
			cpu_time: 0
		};

		for (var i = 0; i < pid_monitors.length; i++) {
			monitor.rss += pid_monitors[i].rss;
			monitor.cpu_utime += pid_monitors[i].cpu_utime;
			monitor.cpu_stime += pid_monitors[i].cpu_stime;
			monitor.cpu_time += pid_monitors[i].cpu_time;
		}
		monitor.processes = pid_monitors.length;

		if (!process.monitor) {
			process.monitor = monitor;
			return;
		}

		// https://stackoverflow.com/questions/7773826/how-to-find-out-the-cpu-usage-for-node-js-process
		var delta = monitor.cpu_time - process.monitor.cpu_time;
		monitor.cpu_percent = delta;
		
		if (monitor.cpu_percent < 0) {
			monitor.cpu_percent = 0;
		}
		monitor.cpu_percent_max = 100;
		monitor.rss_max = server.app_memory * 1024; // its in MB, rss in KB

		process.monitor = monitor;

		client.publish('process_stats', JSON.stringify({
			_id: process._id,
			app: process.app_id,
			monitor: monitor
		}));
	})
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
	sub.processes = ProcessManager.getProcesses().length;

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