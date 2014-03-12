module.exports = new (function() {
	Error.stackTraceLimit = 100;
	
	this.proxyPort = parseInt(process.env.PROXY_PORT) || 8998;
	this.proxyStartPort = parseInt(process.env.PROXY_START_PORT) || 9000;
	
	this.env = process.env.NODE_ENV == "production" ? "production" : "development";
	this.label = process.env.NG_LABEL || 'local';
	
	this.db_options = {
		auto_reconnect: true,
		native_parser: true,
		server: {
			auto_reconnect: true
		}
	};
	
	if (this.env == "production") {
		this.db_options.replset = {
			rs_name: "rs0"
		};
		var auth = "mongodb://nodegear:Jei4hucu5fohNgiengohgh8Pagh4fuacahQuiwee";
		this.db = auth+"@repl1.mongoset.castawaydev.com/nodegear,"+auth+"@repl2.mongoset.castawaydev.com";
		this.port = process.env.PORT || 80;
		this.droneLocation = "/var/ng_apps/";
		this.templateLocation = "/var/ng_templates/";
	} else {
		this.db = "mongodb://127.0.0.1/nodegear";
		this.port = process.env.PORT || 3000;
		this.droneLocation = process.env.HOME+"/ng_apps/";
		this.templateLocation = process.env.HOME+"/ng_templates/";
		
		console.log(this.droneLocation)
	}
	
	this.path = __dirname;
	this.tmp = "/tmp/nodegear/";
})()