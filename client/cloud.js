var optimist = require('optimist')
	, exec = require('child_process').exec
	, request = require('request')
	, fs = require('fs')
	, colors = require('colors')
	, Auth = require('./auth')
	, Deploy = require('./deploy')

var argv = optimist
	.usage('Use nodecloud -deploy', {
		'deploy': {
			description: 'Deploy current directory to nodecloud',
			alias: 'd'
		},
		'register': {
			description: 'Register with nodecloud'
		},
		'login': {
			description: 'Login with nodecloud'
		},
		'help': {
			alias: 'h',
			description: 'Show help'
		}
	})
	.argv

if (argv.h) {
	optimist.showHelp()
}

var deploy = new Deploy(argv);
var auth = new Auth(argv);