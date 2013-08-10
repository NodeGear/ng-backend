var express = require('express')
	, routes = require('./routes')
	, http = require('http')
	, path = require('path')
	, Drone = require('./drone')

drone = new Drone({
	repository: {
		type: 'local',
		path: __dirname+"/app"
	}
}, function() {
	drone.install(function(err) {
		if (err) throw err;
		
		console.log("Installed");
		
		
	})
})