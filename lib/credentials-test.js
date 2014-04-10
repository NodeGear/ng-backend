exports.redis_key = "";

exports.smtp = {
	user: "",
	pass: ""
}

exports.db = "mongodb://127.0.0.1/nodegear-test";
exports.networkDb = "mongodb://127.0.0.1/networkAnalyser-test";
exports.db_options = {
	auto_reconnect: true,
	native_parser: true,
	server: {
		auto_reconnect: true
	}
};
exports.networkDb_options = {
	auto_reconnect: true,
	native_parser: true,
	server: {
		auto_reconnect: true
	}
};

exports.port = process.env.PORT || 3000;

exports.droneLocation = "/tmp/ng_test_apps/";
exports.gitolite = process.env.HOME+"/dev/nodegear-gitolite-test/";
exports.gitoliteKeys = exports.gitolite + "keydir/";
exports.gitoliteConfig = exports.gitolite + "conf/gitolite.conf";

exports.serverid = "local1-test";