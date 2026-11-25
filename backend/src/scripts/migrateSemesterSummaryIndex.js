import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { SemesterSummary } from "../modules/results/semesterSummary.model.js";

const migrate = async () => {
  try {
    if (process.env.CONFIRM_SEMESTER_SUMMARY_INDEX_MIGRATION !== "YES") {
      throw new Error(
        "This migration changes a unique database index. Back up the database first, then set CONFIRM_SEMESTER_SUMMARY_INDEX_MIGRATION=YES."
      );
    }

    await connectDB();
    const collection = SemesterSummary.collection;

    const duplicates = await collection.aggregate([
      {
        $group: {
          _id: {
            studentId: "$studentId",
            examSessionId: "$examSessionId",
            semesterId: "$semesterId"
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 }
    ]).toArray();

    if (duplicates.length > 0) {
      throw new Error(
        "Duplicate student/exam-session/semester summaries exist. Resolve them manually before changing the unique index: " +
        JSON.stringify(duplicates)
      );
    }

    const indexes = await collection.indexes();
    const oldIndex = indexes.find((index) =>
      index.unique &&
      index.key?.studentId === 1 &&
      index.key?.examSessionId === 1 &&
      Object.keys(index.key).length === 2
    );

    if (oldIndex) {
      await collection.dropIndex(oldIndex.name);
      console.log("Dropped legacy unique index:", oldIndex.name);
    }

    await collection.createIndex(
      { studentId: 1, examSessionId: 1, semesterId: 1 },
      { unique: true, name: "student_exam_semester_unique" }
    );

    console.log("Semester summary unique index migration completed.");
  } catch (error) {
    console.error("Semester summary index migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

migrate();
