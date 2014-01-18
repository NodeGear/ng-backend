var mongoose = require('mongoose')
var mailer = require('nodemailer');

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

var transport = mailer.createTransport("Mandrill", {
	auth: {
		user: "matej@matej.me",
		pass: "eELIT9FIJIU52NaWvrMrPg"
	}
})

userSchema.methods.notifyUser = function (subject, text) {
	var options = {
		from: "NodeGear Process Daemon <notifications@nodegear.com>",
		to: this.name+" <"+this.email+">",
		subject: subject,
		html: text+"<br/><br/><b>You are receiving this email because you are signed up on NodeGear.</b>"
	}
	transport.sendMail(options, function(err, response) {
		if (err) throw err;
		
		console.log("Email sent.."+response.message)
	})
}

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

userSchema.statics.authenticate = function (token, cb) {
	exports.User.findOne({
		authToken: token
	}, function(err, user) {
		if (err) throw err;
		
		cb(user);
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

module.exports = mongoose.model('User', userSchema);