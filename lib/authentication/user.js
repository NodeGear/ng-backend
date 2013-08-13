var mongoose = require('mongoose')

var schema = mongoose.Schema;
var ObjectId = schema.ObjectId;

var userSchema = schema({
	username: String,
	name: String,
	email: String,
	password: String
});

exports.User = mongoose.model('User', userSchema);