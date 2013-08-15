var location = process.env.HOME+"/.nodecloud"
	, fs = require('fs')

exports.getToken = function (cb) {
	fs.readFile(location, function(err, data) {
		cb(data)
	})
}

exports.writeToken = function (token) {
	fs.writeFile(location, token, function(err) {
		if (err) throw err;
	})
}
