var Drone = require('../drone/drone')
	, exec = require('child_process').exec;

module.exports = function(app) {
	// Set up routes
	app.get('/drones', listDrones);
	app.post('/drone/create', createDrone);
}

function listDrones (req, res) {
	
}
function createDrone(req, res) {
	if (req.files.drone) {
		console.log(req.files.drone);
		var name = Date.now();
		var dir = '/tmp/nodecloud/';
		var target = '/tmp/nodecloud/'+name;
		
		exec('mkdir -p '+dir+' && mv '+req.files.drone.path+' '+target+' && cd '+dir+' && tar xzf '+name+' && rm '+target, function(err) {
			if (err) throw err;
			
			drone = new Drone({
				repository: {
					type: 'local',
					path: dir
				}
			}, function() {
				drone.installDependencies(function(err) {
					if (err) throw err;
					
					console.log("Installed");
					
					drone.start(function(proc) {
						res.status(200);
						console.log(proc)
						res.send("Listening on port "+proc.spawnWith.env.PORT)
					})
				})
			})
		})
	}
}