var should = require('should')
	, models = require('ng-models')
	, backend = require('../../lib/backend')

module.exports = function(details) {
	details.user = new models.User({
		username: "matejkramny",
		usernameLowercase: "matejkramny",
		name: "Matej Kramny",
		email: "matej@matej.me",
		email_verified: true,
		admin: true
	})
	details.user.save();

	details.app = new models.App({
		name: "Test Application",
		nameUrl: "test-application",
		user: details.user._id,
		location: "/node-js-sample",
		script: "index.js",
		branch: 'master'
	})
	details.app.save();

	details.app_domain = new models.AppDomain({
		app: details.app._id,
		domain: "test.local",
		tld: "local",
		is_subdomain: false
	});
	details.app_domain.save();

	details.app_process = new models.AppProcess({
		app: details.app._id,
		running: false,
		server: backend.server._id
	});
	details.app_process.save();

	details.app_env = new models.AppEnvironment({
		app: details.app._id,
		name: "test",
		value: "value"
	});
	details.app_env.save();
}