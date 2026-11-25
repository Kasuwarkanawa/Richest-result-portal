import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  searchPublishedResult,
  getPublishedResultHistory,
  downloadPublishedResultPdf
} from "./publicResult.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  searchPublishedResultSchema
} from "./publicResult.validation.js";

const router = Router();

const publicResultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many result lookup attempts. Please try again later.",
    errors: []
  }
});

router.post("/search", publicResultLimiter, validate(searchPublishedResultSchema), searchPublishedResult);

router.post("/download-pdf", publicResultLimiter, validate(searchPublishedResultSchema), downloadPublishedResultPdf);

// Credentials are sent in the request body, not in a URL/query string that may be logged.
router.post("/history/search", publicResultLimiter, validate(searchPublishedResultSchema), getPublishedResultHistory);

export default router;