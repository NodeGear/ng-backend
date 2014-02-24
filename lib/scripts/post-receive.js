#!/usr/local/bin/node

// Goes to /home/git/.gitolite/hooks/common/post-receive

var now = Date.now();
var channel = "git_hook_"+now;

var client = require('redis').createClient()

client.subscribe();
client.on("message", function(_channel, message) {
	if (_channel != channel) return;
	
	var msg = JSON.parse(message);
	console.log(msg.message);
	
	if (msg.exit == true) {
		process.exit(0);
	}
});
client.publish("git_hook", JSON.stringify({
	channel: channel,
	user: process.env.GL_USER,
	repo: process.env.GL_REPO,
	repo_base: process.env.GL_REPO_BASE_ABS
}))
