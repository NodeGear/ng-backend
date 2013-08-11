var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')

var Proxy = function() {
	var list = {};
	var lastUsedPort = 8050;
	
	var cloud = require('../cloud')
	
	cloud.on("drone:create", function(drone) {
		var port = lastUsedPort++;
		var pkg = drone.pkg;
		console.log(drone);
	
		if (pkg.subdomain.length > 0 && typeof list[pkg.subdomain.toLowerCase()] === "undefined") {
			list[pkg.subdomain.toLowerCase()] = port;
		}
		for (domain in pkg.domains) {
			var dom = pkg.domains[domain].toLowerCase();
			if (typeof list[dom] === "undefined") {
				list[dom] = port;
			}
		}
		
		drone.port = port;
	})
	
	var proxy = new httpProxy.RoutingProxy();
	http.createServer(function(req, res) {
		// match hostname here
		var hostname = req.headers.host;
		var found = false;
		
		for (host in list) {
			if (host == hostname) {
				proxy.proxyRequest(req, res, {
					host: host,
					port: list[host]
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
	console.log("Proxy listening")
}

module.exports = Proxy;