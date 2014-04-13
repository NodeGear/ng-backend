express = require('express')
	, http = require('http')
	, path = require('path');

var app = express();

console.log(process.env);

// all environments
app.set('port', process.env.PORT);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
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
	var content = '<script src="/socket.io/socket.io.js"></script>\
<script>\
  var socket = io.connect();\
  socket.on("news", function (data) {\
    console.log(data);\
    socket.emit("my other event", { my: "data" });\
  });\
</script>\
<h1>Hello there!</h1>';
  res.end(content);
});
app.get('/crash', function(req, res) {
	// I have to crash :(
	process.nextTick(function () {
		throw Error("I had to crash, so here I am :3");
	});
})

var server = http.createServer(app);
var io = require('socket.io').listen(server);
io.set('log level', 1);

server.listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port'));
});

io.sockets.on('connection', function (socket) {
	console.log("Someone got connected :3")
  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    console.log(data);
  });
});
