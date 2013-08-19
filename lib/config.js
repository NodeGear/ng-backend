module.exports = new (function() {
	this.env = process.env.NODE_ENV == "production" ? "production" : "development";
	
	if (this.env.LOCATION != null) {
		// Locations
		var locations = ['us', 'fr'];
		var location = this.env.LOCATION;
		
		if (locations[location] == null) {
			console.log("ERR:".red.bold + " Bad location "+location);
		}
		
		this.location = location || "local";
	}
	
	if (this.env == "production") {
		this.db = "mongodb://nodecloud:topsecretpassword@api.nodecloud.matej.me/nodecloud";
		this.api = location+".nodecloud.matej.me";
		this.port = process.env.PORT || 80;
		this.droneLocation = "/var/cloudapps/";
	} else {
		this.db = "mongodb://127.0.0.1/nodecloud";
		this.api = "127.0.0.1";
		this.port = process.env.PORT || 3000;
		this.location = "local";
		this.droneLocation = process.env.HOME+"/cloudapps/";
	}
	
	this.tmp = "/tmp/nodecloud/";
})()