var fs = require('fs')
	, mailer = require('nodemailer')

// Warning: Export NG_TEST to enable test mode.

try {
	var credentials = './credentials';
	if (process.env.NG_TEST) {
		credentials = './credentials-test';

		console.log("-- TEST MODE --")
	}

	var credentials = require(credentials)
} catch (e) {
	console.log("\nNo credentials.js File!\n")
	process.exit(1);
}

if (!credentials.serverid || credentials.serverid.length == 0) {
	console.log("\nBad server id.!\n")
	process.exit(1);
}

exports.serverid = credentials.serverid;

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
exports.env = process.env.NODE_ENV == "production" ? "production" : "development";

exports.redis_key = credentials.redis_key;

exports.db = credentials.db;
exports.db_options = credentials.db_options;
exports.networkDb = credentials.networkDb;
exports.networkDb_options = credentials.networkDb_options;

exports.gitolite = credentials.gitolite;
exports.gitoliteKeys = credentials.gitoliteKeys;
exports.gitoliteConfig = credentials.gitoliteConfig;

exports.path = __dirname;