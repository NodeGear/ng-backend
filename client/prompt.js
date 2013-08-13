var prompt = require('prompt')

exports.getLogin = function (cb) {
	prompt.get({
		properties: {
			username: {
				description: "Username".magenta,
				required: true
			},
			password: {
				description: "Password".magenta,
				required: true,
				hidden: true
			}
		}
	}, cb)
}

exports.getRegistration = function (cb) {
	prompt.get({
		properties: {
			name: {
				description: "Full name".magenta,
				required: true
			},
			email: {
				format: 'email',
				required: true,
				description: "Email".magenta
			},
			username: {
				description: "Username".magenta,
				required: true
			},
			password: {
				description: "Password".magenta,
				required: true,
				hidden: true
			}
		}
	}, cb)
}
