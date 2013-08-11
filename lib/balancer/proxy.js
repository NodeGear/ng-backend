var httpProxy = require('http-proxy')
	, http = require('http')

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
		var hostname = req.headers.host.toLowerCase()
		
		for (host in list) {
			console.log("Host: "+host)
			console.log("Port: "+list[host]);
			if (host == hostname) {
				proxy.proxyRequest(req, res, {
					host: host,
					port: list[host]
				});
				break;
			}
		}
	}).listen(8000)
	console.log("Proxy listening")
}

module.exports = Proxy;