var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')

var Proxy = function(cb) {
	this.list = {};
	this.lastUsedPort = 8050;
	
	this.proxy = new httpProxy.RoutingProxy();
	
	var self = this;
	http.createServer(function(req, res) {
		// match hostname here
		var hostname = req.headers.host;
		var found = false;
		
		for (host in self.list) {
			if (host == hostname) {
				self.proxy.proxyRequest(req, res, {
					host: host,
					port: self.list[host]
				});
				found = true;
				break;
			}
		}
		
		if (!found) {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			fs.createReadStream(__dirname+"/404.html").pipe(res);
		}
	}).listen(8009)
	
	console.log("Proxy listening on 8009")
	cb();
	
	cloud.cloud.on("drone:create", function(drone) {
		var port = self.lastUsedPort++; // increment the port.. should be checked that its in use
		var pkg = drone.pkg;
		
		if (pkg.subdomain.length > 0 && typeof self.list[pkg.subdomain.toLowerCase()] === "undefined") {
			self.list[pkg.subdomain.toLowerCase()] = port;
		}
		for (domain in pkg.domains) {
			var dom = pkg.domains[domain].toLowerCase();
			if (typeof self.list[dom] === "undefined") {
				self.list[dom] = port;
			}
		}
		
		drone.port = port;
	})
	
	cloud.cloud.on('drone:data', function(drone, data) {
		for (var i = 0; i < cloud.processes.length; i++) {
			var d = cloud.processes[i];
			if (d.drone == drone) {
				// Send the data to the connection of the drone.
				// TODO check connection is live
				// TODO implement drones into mongoose
				//drone.connection.write(data);
				console.log(data);
				break;
			}
		}
	})
}

module.exports = Proxy;