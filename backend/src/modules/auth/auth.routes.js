import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, me } from "./auth.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { loginSchema } from "./auth.validation.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes.",
    errors: []
  }
});

router.post("/login", loginLimiter, validate(loginSchema), login);
router.get("/me", authMiddleware, me);

export default router;
