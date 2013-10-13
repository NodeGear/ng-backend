var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
var analyticsSchema = schema({
	start: Date,
	end: Date,
	drone: { type: ObjectId, ref: 'Drone' },
	hostname: String,
	found: { type: Boolean, default: false },
	request: String,
	url: String,
	statusCode: Number
})

module.exports = mongoose.model("Analytic", analyticsSchema);