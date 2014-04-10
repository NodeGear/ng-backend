var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')
	, models = require('ng-models')
	, async = require('async')
	, usage = require('usage')
	, config = require('../config')

// TODO on usage stat fail, remove the pid from list.. (because its not responding!)
// TODO domain/subdomain duplication... Has to be checked somewhere.

var Proxy = function() {
	var self = this;
	
	process.nextTick(function() {
		setInterval(self.collectUsage, 1000 * 60);
	
		self.server = server = http.createServer(self.httpRequest);
		server.on('upgrade', self.wsRequest);
		server.listen(config.proxyPort)
		
		console.log("Proxy listening on "+config.proxyPort)
	})
	
	this.list = [];
	this.lastUsedPort = config.proxyStartPort;
	this.proxy = httpProxy.createProxyServer();
	
	this.wsRequest = function (req, socket, head) {
		var hostname = self.getHostname(req);
		
		if (!hostname) {
			// quit the socket
			if (socket && socket.end)
				socket.end();
			
			return;
		}
		
		var drone = self.getDroneByHostname(hostname);
		if (!drone) {
			// quit the socket
			if (socket && socket.end)
				socket.end();
			
			return;
		}
		
		if (drone.processes.length == 0) {
			// quit the socket
			if (socket && socket.end)
				socket.end();
			
			return;
		}
		
		nextProc = drone.processes[0];
		
		self.proxy.ws(req, socket, head, {
			target: {
				host: '127.0.0.1',
				port: nextProc.port
			}
		});
	}

	this.httpRequest = function(req, res) {
		var hostname = self.getHostname(req);
		
		if (!hostname) {
			// let it 404
			res.writeHead(404, { 'Content-Type': 'text/html' });
			fs.createReadStream(__dirname+"/404.html").pipe(res);
		
			return;
		}
		
		var ip = req.connection.remoteAddress;
		// behind nginx or other proxy
		if (req.headers['x-forwarded-for']) {
			ip = req.headers['x-forwarded-for']
		}
		
		var analytic = new models.Analytic({
			start: Date.now(),
			hostname: hostname,
			url: req.url,
			request: req.method,
			ip: ip
		})
		res.on('finish', function () {
			analytic.end = Date.now()
			analytic.statusCode = res.statusCode
		
			analytic.save(function(err) {
				if (err) throw err;
			})
		})
	
		// Metrics for Incoming
		req.on('data', function(chunk) {
			analytic.reqSize += chunk.length;
		})
	
		// Metrics for Outgoing
		var _write = res.write;
		res.write = function (chunk) {
			analytic.resSize += chunk.length;
			_write.call(res, chunk);
		};
	
		var drone = self.getDroneByHostname(hostname);
		if (!drone) {
			// let it 404
			res.writeHead(404, { 'Content-Type': 'text/html' });
			fs.createReadStream(__dirname+"/404.html").pipe(res);
		
			return;
		}
		
		analytic.drone = drone._id
		analytic.found = true
		
		if (drone.processes.length == 0) {
			// let it 404
			res.writeHead(404, { 'Content-Type': 'text/html' });
			fs.createReadStream(__dirname+"/404_no_active_processes.html").pipe(res);
		
			return;
		}
		
		if (drone.lastAccess == -1 || drone.lastAccess >= drone.processes.length) {
			drone.lastAccess = 0;
		}
		nextProc = drone.processes[drone.lastAccess++];
		
		console.log("Proxying to", nextProc);
		
		// proxy it to the drone
		self.proxy.web(req, res, {
			target: {
				host: '127.0.0.1',
				port: nextProc.port
			}
		});
	}
	
	this.collectUsage = function () {
		for (var i = 0; i < self.list.length; i++) {
			var item = self.list[i];
			for (var x = 0; x < item.processes.length; x++) {
				self.collectUsageItem(item, self, item.processes[x]);
			}
		}
	}
}

Proxy.prototype.proxyDrone = function(drone) {
	var self = this;
	
	for (var i = 0; i < self.list.length; i++) {
		if (self.list[i]._id.equals(drone._id)) {
			return;
		}
	}
	
	var item = {
		_id: drone._id,
		processes: [],
		hostnames: [],
		lastAccess: -1
	}
	
	if (drone.subdomain && drone.subdomain.length > 0 && typeof self.list[drone.subdomain.toLowerCase()] === "undefined") {
		var subdomain = drone.subdomain.toLowerCase();
		if (subdomain.length > 0) {
			subdomain += ".app.nodegear.com"
			item.hostnames.push(subdomain);
		}
	}
	for (var i = 0; i < drone.domains.length; i++) {
		var dom = drone.domains[i].toLowerCase();
		if (typeof self.list[dom] === "undefined") {
			item.hostnames.push(dom);
		}
	}
	
	// the drone isn't put in the list for RAM exhaustion reasons.
	self.list.push(item);
	
	console.log("Proxying")
	console.log(item)
	console.log(self.list)
}

Proxy.prototype.addProcess = function (drone, process, port) {
	var self = this;
	
	for (var i = 0; i < self.list.length; i++) {
		if (self.list[i]._id.equals(drone._id)) {
			var item = self.list[i];
			
			item.processes.push({
				id: process.uid,
				pid: process.pid,
				port: port
			});
			console.log(item.processes[item.processes.length-1]);
			
			return item.processes;
		}
	}
	
	return null;
}

Proxy.prototype.removeProcess = function (drone, process) {
	var self = this;
	
	if (typeof process === 'undefined') {
		process = null;
	}
	
	for (var i = 0; i < self.list.length; i++) {
		if (self.list[i]._id.equals(drone._id)) {
			var item = self.list[i];
			
			if (process == null || !process.uid) {
				// Unknown process id, pop the first one from the heap
				item.processes.pop();
				
				return true;
			}
			
			for (var i = 0; i < item.processes.length; i++) {
				if (item.processes[i].id == process.uid) {
					// Remove this process;
					item.processes.splice(i, 1);
					
					return true;
				}
			}
		}
	}
	
	return false;
}

Proxy.prototype.removeDrone = function (drone) {
	var self = this;
	
	for (var i = 0; i < self.list.length; i++) {
		if (self.list[i]._id.equals(drone._id)) {
			self.list.splice(i, 1);
			break;
		}
	}
}

Proxy.prototype.updatePid = function (drone, process) {
	var self = this;
	
	var pid = process.child.pid;
	
	for (var i = 0; i < self.list.length; i++) {
		if (self.list[i]._id.equals(drone._id)) {
			var item = self.list[i];
			
			if (process == null || !process.uid) {
				return;
			}
			
			for (var i = 0; i < item.processes.length; i++) {
				if (item.processes[i].id == process.uid) {
					item.processes[i].pid = process.child.pid;
					
					return;
				}
			}
		}
	}
}

Proxy.prototype.updateDrone = function (drone, cb) {
	var self = this;
	
	var pid = drone.pid;
	
	async.each(self.list, function(it, cb) {
		if (it._id.equals(drone._id)) {
			it.pid = pid;
			
			it.hostnames = [];
			
			if (drone.subdomain && drone.subdomain.length > 0) {
				var subdomain = drone.subdomain.toLowerCase();
				if (subdomain.length > 0) {
					subdomain += ".app.nodegear.com"
					it.hostnames.push(subdomain);
				}
			}
			for (var i = 0; i < drone.domains.length; i++) {
				var dom = drone.domains[i].toLowerCase();
				
				it.hostnames.push(dom);
			}
		}
		cb(null)
	}, function() {
		if (typeof cb !== 'undefined') cb()
	});
}

Proxy.prototype.collectUsageItem = function(item, proxy, process) {
	var self = this;
	
	try {
		if (process.pid) {
			usage.lookup(process.pid, { keepHistory: true }, function(err, result) {
				if (err || !result) {
					console.log("Failed to get stats from pid")
					return;
				}
				
				var mem = result.memory;
				var cpu = result.cpu;
				if (isNaN(mem) || isNaN(cpu)) {
					console.log("Not a number - resource collection usage daemon");
					return;
				}
				
				var usage = new models.Usage({
					drone: item._id,
					memory: mem,
					cpu: cpu,
					time: Date.now()
				})
				usage.save();
			})
		}
	} catch (ex) {
		console.log("Failed to get stats")
	}
}

Proxy.prototype.getHostname = function (req) {
	var self = this;
	
	// match hostname here
	var hostname = req.headers.host;
	if (!hostname) {
		return null;
	}
	
	var splitHostname = hostname.split(":"); // separates the port
	if (splitHostname.length > 1) {
		hostname = splitHostname[0]
	}
	
	return hostname;
}

Proxy.prototype.getDroneByHostname = function (hostname, self) {
	if (!self) self = this;
	
	for (var i = 0; i < self.list.length; i++) {
		var item = self.list[i];
		
		for (var hi = 0; hi < item.hostnames.length; hi++) {
			var host = item.hostnames[hi]
			
			if (host == hostname) {
				return item;
			}
		}
	}
	
	return null;
}

exports.Proxy = Proxy;