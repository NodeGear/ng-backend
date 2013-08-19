var exec = require('child_process').exec
, cloud = require('../cloud')

exports.install = function (drone, cb) {
	exec('cd '+ drone.location +' && npm install', function(err, out) {
		console.log("Out", out)
		cloud.emit('drone:data', drone, out)
		cb(err);
	});
}