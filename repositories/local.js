var fs = require('fs')

exports.init = function (drone) {
	// Read the package.json
	fs.readFile(drone.opts.repository.path+"/package.json", function(err, json) {
		if (err) throw err;
		
		drone.pkg = JSON.parse(json);
		console.log(drone.pkg)
		if (drone.validatePackage()) {
			// Copy app
			drone.copy(function() {
				console.log("Copied")
				drone.cb()
			});
		}
	});
}
