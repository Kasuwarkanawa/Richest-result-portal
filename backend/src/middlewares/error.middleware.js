export const errorMiddleware = (err, req, res, next) => {
  const isMulterError = err?.name === "MulterError";
  const statusCode = err.statusCode ||
    (isMulterError
      ? (err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      : 500);
  const message = isMulterError && err.code === "LIMIT_FILE_SIZE"
    ? "Import file is too large. Maximum allowed size is 5 MB."
    : err.message || "Internal Server Error";
  const errors = err.errors || [];

  if (process.env.NODE_ENV !== "production") {
    console.error("Error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors
  });
};
