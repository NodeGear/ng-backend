var httpProxy = require('http-proxy')
	, http = require('http')
	, fs = require('fs')
	, Monitor = require('./monitor')

var Proxy = function() {
	this.list = {};
	this.lastUsedPort = 8050;
	
	this.monitor = new Monitor(this);
	this.proxy = new httpProxy.RoutingProxy();
	
	var self = this;
	http.createServer(function(req, res) {
		// match hostname here
		var hostname = req.headers.host;
		var found = false;
		
		for (host in self.list) {
			if (host == hostname) {
				proxy.proxyRequest(req, res, {
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
}

module.exports = Proxy;