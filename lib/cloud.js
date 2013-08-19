var cloud;
var express = require('express')
	, http = require('http')
	, path = require('path')
	, config = require('./config')
	, mongoose = require('mongoose')
	, fs = require('fs')

function Cloud() {
	this.drones = []
}

require('util').inherits(Cloud, require('events').EventEmitter);

Cloud.prototype.setup = function () {
	cloud.app = app = express();
	
	fs.readFile(__dirname + "/../package.json", function(err, pkg) {
		if (err) throw err;
		
		cloud.version = pkg.version;
	})
	
	// all environments
	app.set('port', config.port);
	app.use(express.logger('dev'));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(app.router);
	
	// development only
	if ('development' == app.get('env')) {
		app.use(express.errorHandler());
	}
	
	var api = require('./api')(app)
	
	cloud.server = http.createServer(app)
	//cloud.io = require('socket.io').listen(cloud.server)
	
	//api.sockets()
	
	cloud.server.listen(app.get('port'), function() {
		mongoose.connect(config.db)
		console.log('Listening '+config.api+':'+config.port);
	});
	
	var Drone = require('./drone/drone')
		, Proxy = require('./balancer/proxy')
	cloud.proxy = new Proxy()
}

module.exports = cloud = new Cloud();

cloud.setup()