import { z } from "zod";

export const publishExamSessionSchema = z.object({
  body: z.object({
    examSessionId: z.string().trim().min(1, "Exam session ID is required"),
    notes: z.string().trim().optional().or(z.literal(""))
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

export const publishSnapshotIdParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    publishSnapshotId: z.string().trim().min(1, "Publish snapshot ID is required")
  }),
  query: z.object({}).optional()
});

export const rollbackPublishSnapshotSchema = z.object({
  body: z.object({
    reason: z.string().trim().min(10, "Provide a rollback reason of at least 10 characters").max(1000)
  }),
  params: z.object({
    publishSnapshotId: z.string().trim().min(1, "Publish snapshot ID is required")
  }),
  query: z.object({}).optional()
});
