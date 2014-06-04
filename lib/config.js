var mailer = require('nodemailer')

// Warning: Export NG_TEST to enable test mode.

try {
	var credentials = './credentials.json';
	if (process.env.NG_TEST) {
		credentials = './credentials-test.json';

		console.log("-- TEST MODE --")
	}

	var credentials = require(credentials)
} catch (e) {
	console.log("\nNo credentials.json File!\n")
	process.exit(1);
}

if (!credentials.server.id || credentials.server.id.length == 0) {
	console.log("\nBad server id.!\n")
	process.exit(1);
}

exports.credentials = credentials;

// Create SMTP transport method
if (process.env.NG_TEST) {
	exports.transport_enabled = false;
} else {
	exports.transport_enabled = credentials.smtp.user.length > 0;
}
exports.transport = mailer.createTransport("SMTP", {
	service: "Mandrill",
	auth: credentials.smtp
});

exports.version = require('../package.json').version;
exports.production = process.env.NODE_ENV == "production";

exports.path = __dirname;

require('fs').exists('/ng-scripts', function(exists) {
	if (!exists) {
		console.log("/ng-scripts does not exist")
		process.exit(1)
	}
})