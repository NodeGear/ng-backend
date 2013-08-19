var mongoose = require('mongoose')
	, schema = mongoose.Schema;
	, ObjectId = schema.ObjectId;
	
var droneSchema = schema({
	
})

exports.model = mongoose.model("Drone", droneSchema);