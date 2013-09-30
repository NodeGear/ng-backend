module.exports = new (function() {
	this.env = process.env.NODE_ENV == "production" ? "production" : "development";
	
	if (this.env == "production") {
		this.db = "mongodb://nodecloud:Jei4hucu5fohNgiengohgh8Pagh4fuacahQuiwee@127.0.0.1/nodecloud";
		this.port = process.env.PORT || 80;
		this.droneLocation = "/var/cloudapps/";
	} else {
		this.db = "mongodb://127.0.0.1/nodecloud";
		this.port = process.env.PORT || 3000;
		this.droneLocation = process.env.HOME+"/cloudapps/";
	}
	
	this.tmp = "/tmp/nodecloud/";
})()