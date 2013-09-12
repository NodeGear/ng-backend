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
	isRunning: Boolean
})

module.exports = mongoose.model("Drone", droneSchema);