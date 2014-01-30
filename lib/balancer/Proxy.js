var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')
	, Analytic = require('../models').Analytic
	, Usage = require('../models').Usage
	, async = require('async')
	, usage = require('usage')

// TODO on usage stat fail, remove the pid from list.. (because its not responding!)
// TODO domain/subdomain duplication... Has to be checked somewhere.

var Proxy = function() {
	var self = this;
	
	process.nextTick(function() {
		setInterval(self.collectUsage, 1000 * 60);
	
		self.server = server = http.createServer(self.httpRequest);
		server.on('upgrade', self.wsRequest);
		server.listen(9009)
		
		console.log("Proxy listening on 9009")
	})
	
	this.list = [];
	this.lastUsedPort = 9050;
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
		
		self.proxy.ws(req, socket, head, {
			target: {
				host: '127.0.0.1',
				port: drone.port
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
		
		//TODO use redis. faster.
		var analytic = new Analytic({
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
	
		// proxy it to the drone
		self.proxy.web(req, res, {
			target: {
				host: '127.0.0.1',
				port: drone.port
			}
		});
	}
	
	this.collectUsage = function () {
		for (var i = 0; i < self.list.length; i++) {
			self.collectUsageItem(self.list[i], self);
		}
	}
}

Proxy.prototype.proxyDrone = function(drone) {
	var self = this;
	
	var port = self.lastUsedPort++; // increment the port.. should be checked that its in use
	
	var item = {
		port: port,
		_id: drone._id,
		pid: drone.pid,
		hostnames: [],
		port: port
	}
	
	if (drone.subdomain && drone.subdomain.length > 0 && typeof self.list[drone.subdomain.toLowerCase()] === "undefined") {
		var subdomain = drone.subdomain.toLowerCase();
		if (subdomain.length > 0) {
			subdomain += ".nodecloud.net"
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
	
	drone.port = port;
	
	console.log("Proxying")
	console.log(item)
	console.log(self.list)
}

Proxy.prototype.removeDrone = function (drone) {
	var self = this;
	
	for (var i = 0; self.list.length; i++) {
		var item = self.list[i];
		
		if (item._id.equals(drone._id)) {
			self.list.splice(i);
			
			break;
		}
	}
}

Proxy.prototype.updatePid = function (drone) {
	var self = this;
	
	var pid = drone.pid;
	
	var found = false;
	
	for (var i = 0; i < self.list.length; i++) {
		var it = self.list[i];
		
		if (it._id.equals(drone._id)) {
			it.pid = drone.pid;
		}
	}
}

Proxy.prototype.collectUsageItem = function(item) {
	var self = this;
	
	try {
		if (item.pid) {
			usage.lookup(item.pid, { keepHistory: true }, function(err, result) {
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
				
				// TODO this in a Redis db
				var usage = new Usage({
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
	
	var found = null;
	
	for (var i = 0; i < self.list.length; i++) {
		var item = self.list[i];
		
		for (var hi = 0; hi < item.hostnames.length; hi++) {
			var host = item.hostnames[hi]
			
			if (host == hostname) {
				found = item;
				break;
			}
		}
		
		if (found) {
			break;
		}
	}
	
	return found;
}

exports.Proxy = Proxy;