import mongoose from "mongoose";
import { PublishSnapshot } from "./publishSnapshot.model.js";
import { ExamSession } from "../exam-sessions/examSession.model.js";
import { ProcessedResult } from "../results/processedResult.model.js";
import { ExamRegistration } from "../exam-registrations/examRegistration.model.js";
import { SemesterSummary } from "../results/semesterSummary.model.js";
import { User } from "../users/user.model.js";
import { ApiError } from "../../utils/apiError.js";
import { PUBLISH_SNAPSHOT_STATUSES, EXAM_SESSION_STATUSES } from "../../config/constants.js";

const ensureValidObjectId = (id, label) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `Invalid ${label} ID`);
  }
};

const ensureExamSessionExists = async (examSessionId) => {
  ensureValidObjectId(examSessionId, "exam session");
  const examSession = await ExamSession.findById(examSessionId);
  if (!examSession) {
    throw new ApiError(404, "Exam session not found");
  }
  return examSession;
};

const ensureUserExists = async (userId) => {
  ensureValidObjectId(userId, "user");
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return user;
};

const populatePublishSnapshot = (query) =>
  query
    .populate("examSessionId", "name examMonth examYear sessionCategory status")
    .populate("publishedBy", "fullName email role");

export const publishExamSessionService = async ({ examSessionId, notes = "", actorUserId }) => {
  const [examSession] = await Promise.all([
    ensureExamSessionExists(examSessionId),
    ensureUserExists(actorUserId)
  ]);

  const examRegistrations = await ExamRegistration.find({
    examSessionId,
    isEligible: true
  }).select("_id");

  if (examRegistrations.length === 0) {
    throw new ApiError(400, "No eligible exam registrations found for this exam session");
  }

  const eligibleRegistrationIds = examRegistrations.map((item) => item._id);
  const processedResults = await ProcessedResult.find({
    examSessionId,
    examRegistrationId: { $in: eligibleRegistrationIds }
  })\n    .populate("studentId", "registerNumber fullName")\n    .populate("subjectId", "code name shortName subjectType credits")\n    .populate("sourceSemesterId", "number label displayOrder")\n    .select("_id examRegistrationId studentId subjectId sourceSemesterId attemptType attemptNumber internalMark externalMark totalMark passStatus grade gradePoint creditsEarned gradingPolicyId resultVersion processedAt");

  const processedRegistrationIds = new Set(
    processedResults.map((item) => String(item.examRegistrationId))
  );
  const missingRegistrations = examRegistrations.filter(
    (item) => !processedRegistrationIds.has(String(item._id))
  );

  if (missingRegistrations.length > 0 || processedResults.length !== examRegistrations.length) {
    throw new ApiError(
      400,
      `Cannot publish incomplete results: ${missingRegistrations.length} eligible exam registrations have no processed result`
    );
  }

  const semesterSummaries = await SemesterSummary.find({ examSessionId }).select(
    "studentId semesterId"
  );
  const summaryKeys = new Set(
    semesterSummaries.map((item) => `${String(item.studentId?._id || item.studentId)}__${String(item.semesterId?._id || item.semesterId)}`)
  );
  const requiredSummaryKeys = new Set(
    processedResults.map(
      (item) => `${String(item.studentId?._id || item.studentId)}__${String(item.sourceSemesterId?._id || item.sourceSemesterId)}`
    )
  );
  const missingSummaries = [...requiredSummaryKeys].filter(
    (key) => !summaryKeys.has(key)
  );

  if (missingSummaries.length > 0) {
    throw new ApiError(
      400,
      `Cannot publish results: ${missingSummaries.length} student-semester summaries are missing`
    );
  }

  const latestSnapshot = await PublishSnapshot.findOne({ examSessionId })
    .sort({ snapshotVersion: -1 });

  const nextSnapshotVersion = latestSnapshot ? latestSnapshot.snapshotVersion + 1 : 1;

  await PublishSnapshot.updateMany(
    { examSessionId, status: PUBLISH_SNAPSHOT_STATUSES.ACTIVE },
    { $set: { status: PUBLISH_SNAPSHOT_STATUSES.SUPERSEDED } }
  );

  // Publish only records represented by eligible registrations. Ineligible
  // registrations and unrelated summaries in the same exam session must remain private.
  await ProcessedResult.updateMany(
    {
      examSessionId,
      examRegistrationId: { $in: eligibleRegistrationIds }
    },
    { $set: { isPublished: true } }
  );

  const eligibleSummaryIds = semesterSummaries
    .filter((item) =>
      requiredSummaryKeys.has(
        `${String(item.studentId)}__${String(item.semesterId)}`
      )
    )
    .map((item) => item._id);

  await SemesterSummary.updateMany(
    { _id: { $in: eligibleSummaryIds } },
    { $set: { isPublished: true } }
  );

  examSession.status = EXAM_SESSION_STATUSES.PUBLISHED;
  examSession.resultPublishedAt = new Date();
  examSession.resultPublishedBy = actorUserId;
  await examSession.save();

  const uniqueStudents = new Set(processedResults.map((item) => String(item.studentId?._id || item.studentId)));

  const snapshot = await PublishSnapshot.create({
    examSessionId,
    snapshotVersion: nextSnapshotVersion,
    publishedBy: actorUserId,
    publishedAt: new Date(),
    totalStudents: uniqueStudents.size,
    totalSubjects: processedResults.length,
    status: PUBLISH_SNAPSHOT_STATUSES.ACTIVE,
    notes: notes.trim()
  });

  return populatePublishSnapshot(PublishSnapshot.findById(snapshot._id));
};

export const getAllPublishSnapshotsService = async () => {
  return populatePublishSnapshot(
    PublishSnapshot.find().sort({ createdAt: -1 })
  );
};

export const getPublishSnapshotByIdService = async (publishSnapshotId) => {
  ensureValidObjectId(publishSnapshotId, "publish snapshot");

  const snapshot = await populatePublishSnapshot(
    PublishSnapshot.findById(publishSnapshotId)
  );

  if (!snapshot) {
    throw new ApiError(404, "Publish snapshot not found");
  }

  return snapshot;
};

export const rollbackPublishSnapshotService = async ({
  publishSnapshotId,
  reason,
  actorUserId
}) => {
  ensureValidObjectId(publishSnapshotId, "publish snapshot");
  await ensureUserExists(actorUserId);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const snapshot = await PublishSnapshot.findById(publishSnapshotId).session(session);
      if (!snapshot) throw new ApiError(404, "Publish snapshot not found");
      if (snapshot.status !== PUBLISH_SNAPSHOT_STATUSES.ACTIVE) {
        throw new ApiError(409, "Only the active publication can be rolled back");
      }

      const examSession = await ExamSession.findById(snapshot.examSessionId).session(session);
      if (!examSession) throw new ApiError(404, "Exam session not found");
      if (examSession.status !== EXAM_SESSION_STATUSES.PUBLISHED) {
        throw new ApiError(409, "Exam session is not in the published state");
      }

      await ProcessedResult.updateMany(
        { examSessionId: snapshot.examSessionId, isPublished: true },
        { $set: { isPublished: false } },
        { session }
      );
      await SemesterSummary.updateMany(
        { examSessionId: snapshot.examSessionId, isPublished: true },
        { $set: { isPublished: false } },
        { session }
      );

      snapshot.status = PUBLISH_SNAPSHOT_STATUSES.ROLLED_BACK;
      snapshot.rolledBackAt = new Date();
      snapshot.rolledBackBy = actorUserId;
      snapshot.rollbackReason = reason.trim();
      await snapshot.save({ session });

      examSession.status = EXAM_SESSION_STATUSES.APPROVED;
      examSession.resultPublishedAt = null;
      examSession.resultPublishedBy = null;
      await examSession.save({ session });
    });
  } finally {
    await session.endSession();
  }

  return populatePublishSnapshot(PublishSnapshot.findById(publishSnapshotId));
};
