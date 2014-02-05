module.exports = new (function() {
	Error.stackTraceLimit = 100;
	
	this.proxyPort = process.env.PROXY_PORT || 8998;
	this.socketPort = process.env.SOCKET_PORT || 8999;
	
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
	} else {
		this.db = "mongodb://127.0.0.1/nodecloud";
		this.port = process.env.PORT || 3000;
		this.droneLocation = process.env.HOME+"/cloudapps/";
	}
	
	this.path = __dirname;
	this.tmp = "/tmp/nodegear/";
})()