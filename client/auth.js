module.exports = function (argv) {
	this.argv = argv;
	
	
	
	if (argv.login) {
		console.log("Authenticate now".bold.underline.blue)
	}
	if (argv.register) {
		console.log("Register now".bold.underline.blue)
	}
}
