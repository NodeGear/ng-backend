var backend = require('../../lib/backend');
var should = require('should');

if (!process.env.NG_TEST) {
	console.log("\nNot in TEST environment. Please export NG_TEST variable\n");
}

should(process.env.NG_TEST).be.ok;

module.exports = function(callback) {
	it('should wait for server to be ready', function(done) {
		function test () {
			if (backend.ready) {
				callback(require('../../lib/ProcessManager'));

				done(null);
				return;
			}
			
			setTimeout(test, 50);
		}

		test();
	});
};