var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId;

var droneSchema = schema({
	pkg: {},
	user: {
		type: ObjectId,
		ref: "User"
	},
	location: String,
	isRunning: Boolean,
	isInstalled: { type: Boolean, default: false }
})

module.exports = mongoose.model("Drone", droneSchema);