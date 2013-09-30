var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')

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
		
		var found = false;
		
		for (host in self.list) {
			if (host == hostname) {
				// proxy it to the drone
				self.proxy.proxyRequest(req, res, {
					host: host,
					port: self.list[host]
				});
				found = true;
				break;
			}
		}
		
		if (!found) {
			// let it 404
			res.writeHead(200, { 'Content-Type': 'text/html' });
			fs.createReadStream(__dirname+"/404.html").pipe(res);
		}
	}).listen(8009)
	
	console.log("Proxy listening on 8009")
	
	this.proxyDrone = function(drone) {
		var port = self.lastUsedPort++; // increment the port.. should be checked that its in use
		var pkg = drone.pkg;
		
		if (pkg.subdomain && pkg.subdomain.length > 0 && typeof self.list[pkg.subdomain.toLowerCase()] === "undefined") {
			self.list[pkg.subdomain.toLowerCase()] = port;
		}
		for (domain in pkg.domains) {
			var dom = pkg.domains[domain].toLowerCase();
			if (typeof self.list[dom] === "undefined") {
				self.list[dom] = port;
			}
		}
		
		drone.port = port;
	}
}

exports.Proxy = Proxy;