// Baby steps:
// 1. Get Token, otherwise login/register
// 2. Get package.json
// 3. Deploy, send package.json on POST and the tarball with it.
// 4. Display the log of the install, then sub/domains its running on

var token = require('./token')
var exec = require('child_process').exec
var request = require('request')
var rest = require('restler')
var fs = require('fs')
var cloud = require('./api')
var prompt = require('./prompt')

exports.deploy = function(argv) {
	token.getToken(function(token) {
		if (typeof token === "undefined") {
			// Login
			console.log("Please authenticate".red.underline);
		} else {
			preDeploy(token)
		}
	})
}

exports.getPackage = getPackage = function (cb) {
	fs.readFile(process.cwd()+"/package.json", function(err, pkg) {
		if (err) throw err;
		
		if (pkg == null) {
			console.log("No package.json".red);
			return;
		}
		
		var package;
		try {
			package = JSON.parse(pkg);
		} catch (ex) {
			console.log("Bad package.json".bold.red)
			process.exit(1)
		}
		
		if (package.location == null) {
			// Select a location
			prompt.getLocation(function(location) {
				cb(package, location);
			})
			return;
		} else {
			cb(package, location)
		}
	})
}

function preDeploy(token) {
	console.log("PreDeploying".magenta);
	
	getPackage(function(pkg, location) {
		deploy(token, pkg, location)
	});
}

function deploy(token, pkg, location) {
	console.log("Deploying".magenta);
	
	var pkg = JSON.stringify(pkg)
	var tmp = '/tmp/'+Date.now()+'.tar.gz'
	exec('cd '+process.cwd()+' && tar czf '+tmp+' .', function(err) {
		if (err) throw err;
		
		console.log("Deploying to "+location)
		var r = request.post(location+'drone/create', function(err, res, body) {
			console.log(body)

			exec('rm '+tmp, function(err) {
				if (err){
					console.log("Fail removing temp file");
					throw err;
				}
			})
		});

		var form = r.form();

		form.append('drone', fs.createReadStream(tmp));
		form.append('token', token);
		form.append('package', pkg)
		
		form.getLength(function(err, len) {
		    r.setHeader('Content-Length', len);
		});
	});
}

cloud.socket.on('drone', function(data) {
	console.log(data)
})