var prompt = require('prompt')
	, api = require('./api')

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

exports.getLocation = function (cb) {
	var locations = "";
	for (host in api.hosts) {
		locations += "\n - "+host.bold;
	}
	console.log("Available deploy locations:".blue.underline+locations);
	
	prompt.get({
		properties: {
			location: {
				description: "Deploy location".magenta,
				required: true,
				conform: function(value) {
					var val = value.toLowerCase()
					var found = false;
					
					for (host in api.hosts) {
						if (val == host) {
							found = true;
							break;
						}
					}
					
					if (!found) {
						console.log("Valid locations:".blue.underline+locations)
					}
					
					return found
				}
			}
		}
	}, function(err, vals) {
		if (err) throw err;
		
		cb(vals.location);
	})
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
