var exec = require('child_process').exec
	, request = require('request')
	, fs = require('fs')
	, colors = require('colors')
	, auth = require('./auth')
	, deploy = require('./deploy').deploy
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

auth.setup(app);

app.cmd('deploy', function() {
	deploy();
});

console.log("Welcome to "+"NodeCloud".grey)
console.log("Using "+api.api.grey);

app.start()