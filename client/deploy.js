// Baby steps:
// 1. Get Token, otherwise login/register
// 2. Get package.json
// 3. Deploy, send package.json on POST and the tarball with it.
// 4. Display the log of the install, then sub/domains its running on

var token = require('./token')
var exec = require('child_process').exec
var request = require('request')
var fs = require('fs')

exports.deploy = function(argv) {
	token.getToken(function(token) {
		if (typeof token === "undefined") {
			// Login
			console.log("Please authenticate".red.underline);
		} else {
			deploy(token)
		}
	})
}

function deploy(token) {
	console.log("Deploying".magenta);
	
	var tmp = '/tmp/'+Date.now()+'.tar.gz'
	exec('cd '+process.cwd()+' && tar czf '+tmp+' .', function(err) {
		if (err) throw err;
		
		var r = request.post('http://nodecloud.matej.me/drone/create', function(err, res, body) {
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
	});
}