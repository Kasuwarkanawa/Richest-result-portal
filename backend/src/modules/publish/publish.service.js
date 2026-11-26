import mongoose from "mongoose";
import { PublishSnapshot } from "./publishSnapshot.model.js";
import { PublishedResultSnapshotRecord } from "./publishedResultSnapshotRecord.model.js";
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
  ensureValidObjectId(examSessionId, "exam session");
  await ensureUserExists(actorUserId);

  const session = await mongoose.startSession();
  let createdSnapshotId;
  try {
    await session.withTransaction(async () => {
      const examSession = await ExamSession.findById(examSessionId).session(session);
      if (!examSession) throw new ApiError(404, "Exam session not found");
      if (examSession.status === EXAM_SESSION_STATUSES.CLOSED) {
        throw new ApiError(409, "A closed exam session cannot be published");
      }

      const examRegistrations = await ExamRegistration.find({
        examSessionId,
        isEligible: true
      }).select("_id").session(session);
      if (examRegistrations.length === 0) {
        throw new ApiError(400, "No eligible exam registrations found for this exam session");
      }

      const eligibleRegistrationIds = examRegistrations.map((item) => item._id);
      const processedResults = await ProcessedResult.find({
        examSessionId,
        examRegistrationId: { $in: eligibleRegistrationIds }
      })
        .populate("studentId", "registerNumber fullName")
        .populate("subjectId", "code name shortName subjectType credits")
        .populate("sourceSemesterId", "number label displayOrder")
        .select("_id examRegistrationId studentId subjectId sourceSemesterId attemptType attemptNumber internalMark externalMark totalMark passStatus grade gradePoint creditsEarned gradingPolicyId resultVersion processedAt")
        .session(session);

      const invalidFrozenResult = processedResults.find(
        (item) => !item.studentId?._id || !item.subjectId?._id || !item.sourceSemesterId?._id
      );
      if (invalidFrozenResult) {
        throw new ApiError(
          400,
          "Cannot publish: one or more processed results are missing a valid student, subject, or source semester."
        );
      }

      const processedRegistrationIds = new Set(processedResults.map((item) => String(item.examRegistrationId)));
      const missingRegistrations = examRegistrations.filter((item) => !processedRegistrationIds.has(String(item._id)));
      if (missingRegistrations.length > 0 || processedResults.length !== examRegistrations.length) {
        throw new ApiError(400, `Cannot publish incomplete results: ${missingRegistrations.length} eligible exam registrations have no processed result`);
      }

      const semesterSummaries = await SemesterSummary.find({ examSessionId })
        .populate("studentId", "registerNumber fullName")
        .populate("semesterId", "number label displayOrder")
        .session(session);
      const summaryKey = (studentId, semesterId) =>
        `${String(studentId?._id || studentId)}__${String(semesterId?._id || semesterId)}`;
      const summaryKeys = new Set(semesterSummaries.map((item) => summaryKey(item.studentId, item.semesterId)));
      const requiredSummaryKeys = new Set(processedResults.map((item) => summaryKey(item.studentId, item.sourceSemesterId)));
      const missingSummaries = [...requiredSummaryKeys].filter((key) => !summaryKeys.has(key));
      if (missingSummaries.length > 0) {
        throw new ApiError(400, `Cannot publish results: ${missingSummaries.length} student-semester summaries are missing`);
      }

      const frozenResults = processedResults.map((item) => ({
        processedResultId: item._id,
        student: item.studentId ? {
          id: item.studentId._id,
          registerNumber: item.studentId.registerNumber,
          fullName: item.studentId.fullName
        } : null,
        examRegistrationId: item.examRegistrationId,
        subject: item.subjectId ? {
          id: item.subjectId._id,
          code: item.subjectId.code,
          name: item.subjectId.name,
          shortName: item.subjectId.shortName,
          subjectType: item.subjectId.subjectType,
          credits: item.subjectId.credits
        } : null,
        sourceSemester: item.sourceSemesterId ? {
          id: item.sourceSemesterId._id,
          number: item.sourceSemesterId.number,
          label: item.sourceSemesterId.label,
          displayOrder: item.sourceSemesterId.displayOrder
        } : null,
        attemptType: item.attemptType,
        attemptNumber: item.attemptNumber,
        internalMark: item.internalMark,
        externalMark: item.externalMark,
        totalMark: item.totalMark,
        passStatus: item.passStatus,
        grade: item.grade,
        gradePoint: item.gradePoint,
        creditsEarned: item.creditsEarned,
        gradingPolicyId: item.gradingPolicyId,
        resultVersion: item.resultVersion,
        processedAt: item.processedAt
      }));

      const frozenSummaries = semesterSummaries
        .filter((item) => requiredSummaryKeys.has(summaryKey(item.studentId, item.semesterId)))
        .map((item) => ({
          studentId: item.studentId?._id || item.studentId,
          studentRegisterNumber: item.studentId?.registerNumber || null,
          studentFullName: item.studentId?.fullName || null,
          semester: item.semesterId ? {
            id: item.semesterId._id,
            number: item.semesterId.number,
            label: item.semesterId.label,
            displayOrder: item.semesterId.displayOrder
          } : null,
          totalRegisteredSubjects: item.totalRegisteredSubjects,
          totalPassedSubjects: item.totalPassedSubjects,
          totalFailedSubjects: item.totalFailedSubjects,
          totalRegisteredCredits: item.totalRegisteredCredits,
          totalEarnedCredits: item.totalEarnedCredits,
          gpa: item.gpa,
          cgpa: item.cgpa,
          currentArrearCount: item.currentArrearCount,
          totalPendingArrearCount: item.totalPendingArrearCount,
          totalClearedArrearCount: item.totalClearedArrearCount,
          resultVersion: item.resultVersion
        }));

      const latestSnapshot = await PublishSnapshot.findOne({ examSessionId })
        .sort({ snapshotVersion: -1 }).session(session);
      const nextSnapshotVersion = latestSnapshot ? latestSnapshot.snapshotVersion + 1 : 1;

      const uniqueStudents = new Set(processedResults.map((item) => String(item.studentId?._id || item.studentId)));
      const [snapshot] = await PublishSnapshot.create([{
        examSessionId,
        snapshotVersion: nextSnapshotVersion,
        publishedBy: actorUserId,
        publishedAt: new Date(),
        totalStudents: uniqueStudents.size,
        totalSubjects: processedResults.length,
        storageVersion: 2,
        status: PUBLISH_SNAPSHOT_STATUSES.ACTIVE,
        notes: notes.trim()
      }], { session });
      createdSnapshotId = snapshot._id;

      const frozenRecords = [
        ...frozenResults.map((payload) => ({
          snapshotId: snapshot._id,
          examSessionId,
          studentId: payload.student?.id,
          recordType: "RESULT",
          subjectId: payload.subject?.id || null,
          payload
        })),
        ...frozenSummaries.map((payload) => ({
          snapshotId: snapshot._id,
          examSessionId,
          studentId: payload.studentId,
          recordType: "SUMMARY",
          subjectId: null,
          payload
        }))
      ];
      await PublishedResultSnapshotRecord.insertMany(frozenRecords, { session, ordered: true });

      await PublishSnapshot.updateMany(
        { examSessionId, _id: { $ne: snapshot._id }, status: PUBLISH_SNAPSHOT_STATUSES.ACTIVE },
        { $set: { status: PUBLISH_SNAPSHOT_STATUSES.SUPERSEDED } },
        { session }
      );
      await ProcessedResult.updateMany(
        { examSessionId, examRegistrationId: { $in: eligibleRegistrationIds } },
        { $set: { isPublished: true } },
        { session }
      );
      const eligibleSummaryIds = semesterSummaries
        .filter((item) => requiredSummaryKeys.has(summaryKey(item.studentId, item.semesterId)))
        .map((item) => item._id);
      await SemesterSummary.updateMany(
        { _id: { $in: eligibleSummaryIds } },
        { $set: { isPublished: true } },
        { session }
      );

      examSession.status = EXAM_SESSION_STATUSES.PUBLISHED;
      examSession.resultPublishedAt = new Date();
      examSession.resultPublishedBy = actorUserId;
      await examSession.save({ session });
    });
  } finally {
    await session.endSession();
  }

  return populatePublishSnapshot(PublishSnapshot.findById(createdSnapshotId));
};

export const getAllPublishSnapshotsService = async () => {
  return populatePublishSnapshot(
    PublishSnapshot.find().select("-frozenResults -frozenSummaries").sort({ createdAt: -1 })
  );
};

export const getPublishSnapshotByIdService = async (publishSnapshotId) => {
  ensureValidObjectId(publishSnapshotId, "publish snapshot");

  const snapshot = await populatePublishSnapshot(
    PublishSnapshot.findById(publishSnapshotId).select("-frozenResults -frozenSummaries")
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
