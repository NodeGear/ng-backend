var Drone = require('../drone/drone')
	, exec = require('child_process').exec
	, User = require('../authentication/user').User
	, async = require('async')
	, cloud = require('../cloud')
	, fs = require('fs')
	, droneAPI = require('./drone')
	, authAPI = require('./auth')

module.exports = function(app) {
	// Set up routes
	app.get('/drones', authAPI.checkToken, droneAPI.listDrones)
		.post('/drone/create', authAPI.checkToken, droneAPI.createDrone)
		.post('/register', authAPI.doRegister)
		.post('/login', authAPI.doLogin)
		.get('/username/:username/available', authAPI.checkUsername)
}