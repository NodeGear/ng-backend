var mailer = require('nodemailer');

var logtrail = require('logtrail');

logtrail.configure({
	timestamp: true,
	stacktrace: true,
	loglevel: 'trace',
	basedir: require('path').join(__dirname, '..')
});

exports.testing = !!process.env.TEST;

try {
	var credentials = './credentials.json';
	if (process.env.TEST) {
		credentials = './credentials-test.json';
	}

	var credentials = require(credentials)
} catch (e) {
	logtrail.fatal("No credentials.json File!")
	process.exit(1);
}

if (!credentials.server.id || credentials.server.id.length == 0) {
	logtrail.fatal("Bad server id.!")
	process.exit(1);
}

exports.credentials = credentials;

exports.metrics = new (require('lynx'))(credentials.statsd_ip, credentials.statsd_port);

// Create SMTP transport method
if (process.env.TEST) {
	exports.transport_enabled = false;
} else {
	exports.transport_enabled = credentials.smtp.user.length > 0;
}

exports.transport = mailer.createTransport("SMTP", {
	service: "Mandrill",
	auth: credentials.smtp,
	port: 2525
});

exports.version = require('../package.json').version;
exports.production = process.env.NODE_ENV == "production";

exports.path = __dirname;