module.exports = function(argv) {
	this.argv = argv;
	
	this.deploy = function () {
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
		});
	}
	
	if (argv.deploy) {
		this.deploy();
	}
}