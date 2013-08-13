var mongoose = require('mongoose')

var schema = mongoose.Schema;
var ObjectId = schema.ObjectId;
var crypto = require('crypto')

var userSchema = schema({
	username: String,
	name: String,
	email: String,
	password: String,
	authToken: String
});

userSchema.statics.taken = function (username, cb) {
	exports.User.findOne({
		username: username
	}, function(err, user) {
		if (err) throw err;
		
		cb(user == null ? false : true)
	})
}

userSchema.statics.takenEmail = function (email, cb) {
	exports.User.findOne({
		email: email
	}, function(err, user) {
		if (err) throw err;
		
		cb(user == null ? false : true)
	})
}

userSchema.methods.generateToken = function (cb) {
	var self = this;
	crypto.randomBytes(48, function(ex, buf) {
		self.authToken = buf.toString('hex');
		self.save(function(err) {
			cb(self.authToken)
		})
	});
}

exports.User = mongoose.model('User', userSchema);