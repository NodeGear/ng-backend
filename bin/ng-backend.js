
require('colors');

var fs = require('fs'),
	path = require('path');

// helper modules
var ncp = require('ncp'),
	chmodr = require('chmodr');

// Install /ng-scripts
fs.exists('/ng-scripts', function(exists) {
	if (!exists) {
		console.log(" /ng-scripts does not exist".red);
		console.log(" Installing. You need to be sudo dude!. ".red);
	} else {
		console.log(" Refreshing /ng-scripts!".yellow);
	}

	ncp(path.join(__dirname, '..', 'lib', 'scripts'), '/ng-scripts', function (err) {
		if (err) throw err;

		chmodr('/ng-scripts', 0755, function (err) {
			if (err) throw err;

			console.log('Copy + Chmod 0755 done to /ng-scripts.');

			
			// Start the backend
			require('../lib/backend')
		});
	});
})
