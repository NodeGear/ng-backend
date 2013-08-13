var location = "/Users/matejkramny/.nodecloud"
	, fs = require('fs')

exports.getToken = function (cb) {
	fs.readFile(location, function(err, data) {
		cb(data)
	})
}

exports.writeToken = function (token) {
	console.log("Writing" +token)
	fs.writeFile(location, token, function(err) {
		if (err) throw err;
	})
}
