var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')
	, Analytic = require('../models').Analytic

var Proxy = function() {
	this.list = {};
	this.lastUsedPort = 8050;
	
	this.proxy = new httpProxy.RoutingProxy();
	
	var self = this;
	http.createServer(function(req, res) {
		// match hostname here
		var hostname = req.headers.host;
		var splitHostname = hostname.split(":"); // separates the port
		if (splitHostname.length > 1) {
			hostname = splitHostname[0]
		}
		
		console.log("Remote: "+req.connection.remoteAddress)
		console.log(req.headers)
		
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
		
		for (host in self.list) {
			if (host == hostname) {
				var item = self.list[host];
				
				analytic.drone = item._id
				analytic.found = true
				
				// proxy it to the drone
				self.proxy.proxyRequest(req, res, {
					host: host,
					port: item.port,
					chunkCounter: data
				});
				found = true;
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
			_id: drone._id
		}
		
		if (pkg.subdomain && pkg.subdomain.length > 0 && typeof self.list[pkg.subdomain.toLowerCase()] === "undefined") {
			var subdomain = pkg.subdomain.toLowerCase();
			if (subdomain.length > 0) {
				subdomain += ".nodecloud.net"
			}
			self.list[subdomain] = item;
		}
		for (domain in pkg.domains) {
			var dom = pkg.domains[domain].toLowerCase();
			if (typeof self.list[dom] === "undefined") {
				self.list[dom] = item;
			}
		}
		
		drone.port = port;
		
		console.log("Proxying")
		console.log(item)
		console.log(self.list)
	}
}

exports.Proxy = Proxy;