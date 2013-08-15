// monitors for new/exiting drones
var Monitor = module.exports = function(proxy) {
	this.proxy = proxy;
	this.cloud = require('../cloud')
	
	var self = this;
	this.cloud.on("drone:create", function(drone) {
		var port = self.proxy.lastUsedPort++;
		var pkg = drone.pkg;
		console.log(drone);
		
		if (pkg.subdomain.length > 0 && typeof self.proxy.list[pkg.subdomain.toLowerCase()] === "undefined") {
			self.proxy.list[pkg.subdomain.toLowerCase()] = port;
		}
		for (domain in pkg.domains) {
			var dom = pkg.domains[domain].toLowerCase();
			if (typeof self.proxy.list[dom] === "undefined") {
				self.proxy.list[dom] = port;
			}
		}
		
		drone.port = port;
	})
}