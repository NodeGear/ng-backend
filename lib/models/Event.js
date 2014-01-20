var mongoose = require('mongoose')
	, ObjectId = mongoose.Schema.ObjectId

var schema = mongoose.Schema({
	created: { type: Date, default: Date.now },
	name: String, //e.g. Restart
	message: String, //e.g. App restarted <a href="loglink">log</a>
})

module.exports = mongoose.model("Event", schema);