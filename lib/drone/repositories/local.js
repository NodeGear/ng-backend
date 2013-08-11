var fs = require('fs')

exports.init = function (drone) {
	// Read the package.json
	fs.readFile(drone.opts.repository.path+"/package.json", function(err, json) {
		if (err) throw err;
		
		drone.pkg = JSON.parse(json);
		if (drone.validatePackage()) {
			// Copy app
			drone.install(function() {
				console.log("Copied")
				drone.cloud.emit("drone:create", drone)
				drone.cb()
			});
		}
	});
}
