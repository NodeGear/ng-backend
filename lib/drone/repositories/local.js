var fs = require('fs')
var cloud = require('../../cloud')

exports.init = function (drone) {
	// Validate the package
	var validate_res = drone.validatePackage();
	
	if (validate_res === true) {
		// Install the app
		drone.install(function() {
			console.log("Installed into its drone directory")
			cloud.emit("drone:create", drone)
			drone.log("Drone created")
		});
	} else {
		cloud.emit("drone:data", drone, validate_res); //todo drone:fail?
	}
}
