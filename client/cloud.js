var exec = require('child_process').exec
	, request = require('request')
	, fs = require('fs')
	, colors = require('colors')
	, auth = require('./auth')
	, deploy = require('./deploy').deploy
	, drone = require('./drone')
	, flatiron = require('flatiron')
	, app = flatiron.app
	, api = require('./api')
	, io = require('socket.io-client')

app.use(flatiron.plugins.cli, {
	dir: __dirname,
	usage: [
		'NodeCloud login/register/deploy/list'
	]
})

// TODO read the package.json, validate. if wrong, stop. store in exports.pkg

auth.setup(app);

app.cmd('deploy', function() {
	deploy();
});

app.cmd('start', function() {
	drone.start()
})
app.cmd('stop', function() {
	drone.stop()
})
app.cmd('restart', function() {
	drone.restart()
})
app.cmd('log', function() {
	
})

console.log("Welcome to "+"NodeCloud".grey)
console.log("Using "+api.api.grey);

app.start()