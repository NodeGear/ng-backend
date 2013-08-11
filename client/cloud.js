var optimist = require('optimist')
	, exec = require('child_process').exec
	, request = require('request')
	, fs = require('fs')

var tmp = '/tmp/'+Date.now()+'.tar.gz'
console.log(tmp)
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
})
