var exec = require('child_process').exec;

exports.install = function (drone, cb) {
	exec('cd '+ drone.location +' && npm install', function(err) {
		cb(err);
	});
}