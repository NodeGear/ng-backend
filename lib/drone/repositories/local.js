var fs = require('fs')
var cloud = require('../../cloud')

exports.init = function (drone) {
	// Validate the package
	if (drone.validatePackage()) {
		// Install the app
		drone.install(function() {
			console.log("Installed into its drone directory")
			cloud.emit("drone:create", drone)
			drone.cb()
		});
	}
}
