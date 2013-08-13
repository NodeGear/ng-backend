var exec = require('child_process').exec
	, request = require('request')
	, fs = require('fs')
	, colors = require('colors')
	, auth = require('./auth')
	, deploy = require('./deploy').deploy
	, flatiron = require('flatiron')
	, app = flatiron.app

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

app.start()