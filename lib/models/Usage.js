var mongoose = require('mongoose')
	, schema = mongoose.Schema
	, ObjectId = schema.ObjectId
	
var usageSchema = schema({
	time: Date,
	drone: { type: ObjectId, ref: 'Drone' },
	memory: Number, // bytes
	cpu: Number
})

module.exports = mongoose.model("Usage", usageSchema);