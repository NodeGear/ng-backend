var cloud = require('../cloud')

exports.router = function (app) {
	app.get('/drones', listDrones);
}

function listDrones (req, res) {
	var drones = cloud.app.drones;
	res.send(drones);
}
