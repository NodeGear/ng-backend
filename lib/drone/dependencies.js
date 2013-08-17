var exec = require('child_process').exec;

exports.install = function (drone, cb) {
	exec('cd '+ drone.location +' && npm install', function(err, out) {
		console.log("Out", out)
		drone.cloud.emit('drone:data', drone, out)
		cb(err);
	});
}