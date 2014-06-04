var config = require('../lib/config');
var backend = require('../lib/backend');
var ProcessManager;
var fs = require('fs');
var router = require('../lib/routes');

var should = require('should'),
	models = require('ng-models')

require('./utils/pre.js')(function(pm) {
	ProcessManager = pm;
})

describe('router test', function() {
	var details = {};

	before(function() {
		require('./utils/user_setup')(details)
	});

	it('will start app via router', function(done) {
		this.timeout(0);

		backend.bus.once('app:start', function() {
			var process = ProcessManager.getProcess(details.app_process);

			should(process).not.be.null;

			done()
		});

		router.startDrone({
			id: details.app_process._id
		});
	})

	it('will restart app via git', function(done) {
		this.timeout(0);

		backend.bus.once('app:start', function() {
			var process = ProcessManager.getProcess(details.app_process);

			should(process).not.be.null;
			
			done()
		});

		router.restart({
			id: details.app_process._id
		});
	})
})