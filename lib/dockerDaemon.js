var httpRequest = require('./request').httpRequest
	, processManager = require('./ProcessManager'),
	logtrail = require('logtrail');

httpRequest()
.get('/v1.13/events')
.onData(function (chunk) {
	try {
		var msg = JSON.parse(chunk);
		var process = processManager.getProcessByContainer(msg.id);

		if (!process) {
			logtrail.warn('Process is not managed by Nodegear!', msg);

			return;
		}

		if (msg.status == 'stop') {
			process.processStop();
		} else if (msg.status == 'die') {
			process.processExit();
		} else if (msg.status == 'restart') {
			process.processRestart();
		} else if (msg.status == 'start') {
			process.processStart();
		}
	} catch (e) {
		logtrail.error('Could not Parse', e);
	}
})
.error(function (e) {
	logtrail.error('docker daemon error', e);
})
.run(function (status) {
	logtrail.warn('end of stream..', status);
});