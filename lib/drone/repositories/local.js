var fs = require('fs')

exports.init = function (drone) {
	// Validate the package
	if (drone.validatePackage()) {
		// Install the app
		drone.install(function() {
			console.log("Installed into its drone directory")
			drone.cloud.emit("drone:create", drone)
			drone.cb()
		});
	}
}
