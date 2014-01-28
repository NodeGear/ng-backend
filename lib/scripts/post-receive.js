#!/usr/local/bin/node

var socket = require('socket.io-client').connect('http://127.0.0.1:8049')
socket.on('connect', function() {
	socket.emit('git hook', {
		user = process.env.GL_USER,
		repo = process.env.GL_REPO,
		repo_base = process.env.GL_REPO_BASE_ABS
	});
	socket.on('git hook response', function(out) {
		console.log(out);
	})
	socket.on('git hook end', function() {
		exit(0);
	})
});