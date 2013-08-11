var express = require('express')
	, http = require('http')
	, path = require('path')
	, events = require('events')
	, util = require('util')
	, Drone = require('./drone/drone')
	, Proxy = require('./balancer/proxy')

var Cloud = function Cloud() {
	this.app = app = express();
	
	// all environments
	app.set('port', process.env.PORT || 3000);
	app.use(express.logger('dev'));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(app.router);
	
	// development only
	if ('development' == app.get('env')) {
	  app.use(express.errorHandler());
	}
	
	var api = require('./api')(app)
	
	http.createServer(app).listen(app.get('port'), function(){
		console.log('Express server listening on port ' + app.get('port'));
	});
}

util.inherits(Cloud, events.EventEmitter);

module.exports = new Cloud();
module.exports.proxy = new Proxy()