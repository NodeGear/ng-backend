var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')
	, Analytic = require('../models').Analytic
	, Usage = require('../models').Usage
	, async = require('async')
	, usage = require('usage')

var Proxy = function() {
	this.list = [];
	this.lastUsedPort = 8050;
	
	this.proxy = new httpProxy.RoutingProxy();
	
	var self = this;
	
	http.createServer(function(req, res) {
		// match hostname here
		var buffer = httpProxy.buffer(req)
		
		var hostname = req.headers.host;
		if (!hostname) {
			// let it 404
			res.writeHead(404, { 'Content-Type': 'text/html' });
			fs.createReadStream(__dirname+"/404.html").pipe(res);
			return;
		}
		
		var splitHostname = hostname.split(":"); // separates the port
		if (splitHostname.length > 1) {
			hostname = splitHostname[0]
		}
		
		var ip = req.connection.remoteAddress;
		// behind nginx or other proxy
		if (req.headers['x-forwarded-for']) {
			ip = req.headers['x-forwarded-for']
		}
		
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
		
		req.on('data', function(chunk) {
			analytic.reqSize += chunk.length;
		})
		function data(size) {
			analytic.resSize += size;
		}
		
		var found = false;
		
		for (var i = 0; i < self.list.length; i++) {
			var item = self.list[i];
			
			for (var hi = 0; hi < item.hostnames.length; hi++) {
				var host = item.hostnames[hi]
				
				if (host == hostname) {
					analytic.drone = item._id
					analytic.found = true
				
					// proxy it to the drone
					self.proxy.proxyRequest(req, res, {
						host: host,
						port: item.port,
						buffer: buffer,
						chunkCounter: data
					});
					found = true;
					break;
				}
			}
			
			if (found) {
				break;
			}
		}
		
		if (!found) {
			// let it 404
			res.writeHead(404, { 'Content-Type': 'text/html' });
			fs.createReadStream(__dirname+"/404.html").pipe(res);
		}
	}).listen(8009)
	
	console.log("Proxy listening on 8009")
	
	this.proxyDrone = function(drone) {
		var port = self.lastUsedPort++; // increment the port.. should be checked that its in use
		var pkg = drone.pkg;
		
		var item = {
			port: port,
			_id: drone._id,
			pid: drone.pid,
			hostnames: [],
			port: port
		}
		
		if (pkg.subdomain && pkg.subdomain.length > 0 && typeof self.list[pkg.subdomain.toLowerCase()] === "undefined") {
			var subdomain = pkg.subdomain.toLowerCase();
			if (subdomain.length > 0) {
				subdomain += ".nodecloud.net"
				item.hostnames.push(subdomain);
			}
		}
		for (domain in pkg.domains) {
			var dom = pkg.domains[domain].toLowerCase();
			if (typeof self.list[dom] === "undefined") {
				item.hostnames.push(dom);
			}
		}
		
		self.list.push(item);
		
		drone.port = port;
		
		console.log("Proxying")
		console.log(item)
		console.log(self.list)
	}
	
	this.removeDrone = function (drone) {
		for (var i = 0; self.list.length; i++) {
			var item = self.list[i];
			
			if (item._id.equals(drone._id)) {
				console.log("Not proxying anymore! Drone list: ")
				console.log(self.list)
				self.list.splice(i);
				console.log(self.list)
				
				break;
			}
		}
	}
	
	this.updatePid = function (drone) {
		var pid = drone.pid;
		
		var found = false;
		
		for (var i = 0; i < self.list.length; i++) {
			var it = self.list[i];
			if (it._id.equals(drone._id)) {
				it.pid = drone.pid;
			}
		}
	}
	
	this.collectUsageItem = function(item) {
		try {
			if (item.pid) {
				usage.lookup(item.pid, { keepHistory: true }, function(err, result) {
					if (err) {
						console.log("Failed to get stats from pid")
						return;
					}
					
					var usage = new Usage({
						drone: item._id,
						memory: result.memory,
						cpu: result.cpu,
						time: Date.now()
					})
					usage.save();
					
					result.memory = result.memory / 1024 / 1024
					console.log(result);
				})
			}
		} catch (ex) {
			console.log("Failed to get stats")
		}
	}
	
	this.collectUsage = function () {
		for (var i = 0; i < self.list.length; i++) {
			self.collectUsageItem(self.list[i]);
		}
	}
	
	setInterval(this.collectUsage, 1000 * 60);
}

exports.Proxy = Proxy;