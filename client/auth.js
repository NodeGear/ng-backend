var app;
var prompt = require('prompt')
	, prompt = require('./prompt')
	, async = require('async')
	, api = require('./api')
	, token = require('./token')

exports.setup = function (theApp) {
	app = theApp;
	
	app.cmd('login', function() {
		console.log("Executing command " + "login".blue)
		login()
	});
	
	app.cmd('register', function() {
		console.log("Executing command " + "register".blue)
		register()
	})
}

function login () {
	prompt.getLogin(function(err, data) {
		if (err) throw err;
		
		api.doLogin(data, function(data, res) {
			if (data.status == 200) {
				// logged in
				// store data.token somewhere..
				console.log("Login success".blue.underline);
				token.writeToken(data.token);
			} else if (data.status == 403) {
				// Bad login
				console.log("Login fail:".red.underline);
				console.log("Sorry, no user with those credentials.\n".red)
				login()
			} else {
				console.log("Its bad. Unknown error when interfacing our servers")
			}
		})
	})
}

function register () {
	prompt.getRegistration(function(err, data) {
		if (err) throw err;
		
		api.doRegister(data, function(data, res) {
			if (data.status == 200) {
				console.log("Registration complete".blue.underline)
			} else if (data.status == 403) {
				console.log("Registration failed:".red.underline)
				for (error in data.errors) {
					console.log((" - " + error.bold + " "+ data.errors[error]).red);
				}
				console.log("\nTry again".magenta)
				register()
			} else {
				console.log("Its bad. Unknown error when interfacing our servers")
			}
		})
	});
}