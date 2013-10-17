express = require('express')
	, http = require('http')
	, path = require('path')
	, fs = require('fs')

var app = express();

// all environments
app.set('port', process.env.PORT);
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', function(req, res) {
  res.send("<img src='/image.gif'>");
});
app.get('/image.gif', function(req, res) {
	fs.createReadStream(__dirname + '/image.gif').pipe(res)
})

http.createServer(app).listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port'));
});