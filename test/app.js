var config = require('../lib/config');
var backend = require('../lib/backend');
var ProcessManager;
var fs = require('fs')

var should = require('should'),
	models = require('ng-models')

require('./utils/pre')(function(pm) {
	ProcessManager = pm;
})

describe('will test app stuff', function() {
	var self = this;
	var details = {};

	before(function() {
		require('./utils/user_setup')(details)
	});
	
	it('will manage process', function(done) {
		ProcessManager.manageProcess(details.app_process);
		
		ProcessManager.get_processes().should.be.instanceOf(Array).and.have.lengthOf(1);
		done(null);
	});

	it('will start process', function(done) {
		this.timeout(0);
		var process = ProcessManager.getProcess(details.app_process);

		should(process).not.be.null;

		process.start(function() {
			setTimeout(done, 200);
		});
	})

	it('should verify process is running', function(done) {
		var process = ProcessManager.getProcess(details.app_process);

		should(process).not.be.null;

		process.getProcess(function(app_proc) {
			app_proc.running.should.be.true;
			
			done(null);
		})
	})

	it('should stop process', function(done) {
		this.timeout(0);

		var proc = ProcessManager.getProcess(details.app_process);

		should(proc).not.be.null;

		var ret = proc.stop();
		should(ret).be.true;

		setTimeout(done, 1000);
	})

	it('should verify process dir is deleted', function(done) {
		fs.exists('/home/'+details.user._id+'/'+details.app_process._id, function(exists) {
			exists.should.be.false;

			done();
		});
	});
})