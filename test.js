var http = require('http');

http.createServer(function(req, res) {
console.log(req);
}).listen(8080);
