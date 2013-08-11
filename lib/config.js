module.exports = new (function() {
	this.env = process.env.NODE_ENV == "production" ? "production" : "development";
	
	if (this.env == "production") {
		this.db = "mongodb://nodecloud:topsecretpassword@127.0.0.1/nodecloud";
		this.hostname = "nodecloud.matej.me";
		this.port = process.env.PORT || 80;
	} else {
		this.db = "mongodb://127.0.0.1/nodecloud";
		this.hostname = "127.0.0.1";
		this.port = process.env.PORT || 3000;
	}
})()