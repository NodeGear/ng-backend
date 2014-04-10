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
exports.hash = '';
exports.env = process.env.NODE_ENV == "production" ? "production" : "development";

exports.redis_key = credentials.redis_key;

exports.db = credentials.db;
exports.networkDb = credentials.networkDb;

exports.db_options = credentials.db_options;
exports.networkDb_options = credentials.networkDb_options;

exports.port = process.env.PORT || 80;
exports.proxyPort = credentials.proxyPort || 8998;
exports.proxyStartPort = credentials.proxyStartPort || 9000;

exports.droneLocation = credentials.droneLocation;
exports.gitolite = credentials.gitolite;
exports.gitoliteKeys = credentials.gitoliteKeys;
exports.gitoliteConfig = credentials.gitoliteConfig;
exports.templateLocation = credentials.templateLocation;

exports.path = __dirname;
exports.tmp = "/tmp/nodegear/";

fs.exists(exports.tmp, function(exists) {
	if (!exists) {
		console.log("Creating tmp dir")
		fs.mkdir(exports.tmp, function(err) {
			if (err) throw err;
		})
	}
});
fs.exists(exports.droneLocation, function(exists) {
	if (!exists) {
		console.log("Creating drone location dir")
		fs.mkdir(exports.droneLocation, function(err) {
			if (err) throw err;
		})
	}
});

/*
// LEGACY
if (this.env == "production") {
	this.db_options.replset = {
		rs_name: "rs0"
	};
	var auth = "mongodb://nodegear:Jei4hucu5fohNgiengohgh8Pagh4fuacahQuiwee";
	this.db = auth+"@repl1.mongoset.castawaydev.com/nodegear,"+auth+"@repl2.mongoset.castawaydev.com";
	this.droneLocation = "/var/ng_apps/";
	this.templateLocation = "/var/ng_templates/";
} else {
	this.db = "mongodb://127.0.0.1/nodegear";
	this.port = process.env.PORT || 3000;
	this.droneLocation = process.env.HOME+"/ng_apps/";
	this.templateLocation = process.env.HOME+"/ng_templates/";
	
	console.log(this.droneLocation)
}*/