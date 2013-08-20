var cloud = require('../cloud')

// monitors for new/exiting drones
var Monitor = module.exports = function(proxy) {
	this.proxy = proxy;
	
	var self = this;
	cloud.on("drone:create", function(drone) {
		var port = self.proxy.lastUsedPort++; // increment the port.. should be checked that its in use
		var pkg = drone.pkg;
		
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
	
	cloud.on('drone:data', function(drone, data) {
		for (var i = 0; i < cloud.drones.length; i++) {
			var d = cloud.drones[i];
			if (d == drone) {
				// Send the data to the connection of the drone.
				// TODO check connection is live
				// TODO implement drones into mongoose
				//drone.connection.write(data);
				break;
			}
		}
	})
}