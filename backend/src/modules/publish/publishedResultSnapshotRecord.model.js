import mongoose from "mongoose";

const publishedResultSnapshotRecordSchema = new mongoose.Schema({
  snapshotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PublishSnapshot",
    required: true,
    index: true
  },
  examSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ExamSession",
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },
  recordType: {
    type: String,
    enum: ["RESULT", "SUMMARY"],
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, { timestamps: true });

publishedResultSnapshotRecordSchema.index({
  snapshotId: 1,
  studentId: 1,
  recordType: 1,
  subjectId: 1
});
publishedResultSnapshotRecordSchema.index({
  studentId: 1,
  recordType: 1,
  createdAt: -1
});

export const PublishedResultSnapshotRecord = mongoose.model(
  "PublishedResultSnapshotRecord",
  publishedResultSnapshotRecordSchema
);
