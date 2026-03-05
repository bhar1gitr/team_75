// const mongoose = require('mongoose');

// const NoteSchema = new mongoose.Schema({
//   userId: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: 'User', 
//     required: true 
//   },
//   text: { type: String, required: true },
//   latitude: { type: Number, required: true },
//   longitude: { type: Number, required: true },
//   createdAt: { type: Date, default: Date.now }
// });

// const mongoose = require('mongoose');

// const NoteSchema = new mongoose.Schema({
//   userId: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: 'User', 
//     required: true 
//   },
//   className: { type: String, required: true },
//   directorName: String,
//   directorNumber: String,
//   address: String,
//   contactPersonName: String,
//   contactPersonNumber: String,
//   studentCount: { type: Number, default: 0 }, 
//   classCount: { type: Number, default: 0 },
//   latitude: { type: Number, required: true },
//   longitude: { type: Number, required: true },
//   createdAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model('Note', NoteSchema);

const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  className: { type: String, required: true },
  directorName: String,
  directorNumber: String,
  address: String,
  contactPersonName: String,
  contactPersonNumber: String,
  studentCount: { type: Number, default: 0 }, 
  classCount: { type: Number, default: 0 },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  subjectsTaught: String,
  // CHANGE THIS LINE:
  remarks: [String], // <--- This allows the array of 5 notes
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Note', NoteSchema);