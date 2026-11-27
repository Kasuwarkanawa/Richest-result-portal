import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { supabaseHealthCheck } from "./config/supabase.js";
import apiRoutes from "./routes/index.js";
import { notFoundMiddleware } from "./middlewares/notFound.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        env.frontendUrl,
        ...(env.nodeEnv === "development"
          ? ["http://localhost:5173", "http://127.0.0.1:5173"]
          : [])
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
    errors: []
  }
});

app.use(globalLimiter);

// Supabase connectivity probe is intentionally before MongoDB middleware.
// It checks only the server-side PostgREST connection and returns no credentials or row data.
app.get("/api/health/supabase", async (_req, res) => {
  try {
    const health = await supabaseHealthCheck();
    return res.status(200).json({
      success: true,
      message: "Supabase connection is healthy",
      data: health
    });
  } catch (_error) {
    return res.status(503).json({
      success: false,
      message: "Supabase connection check failed"
    });
  }
});

// Reuse the MongoDB connection across Vercel serverless invocations.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "RIGCHEST Result Portal API is live"
  });
});

app.use("/api", apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
