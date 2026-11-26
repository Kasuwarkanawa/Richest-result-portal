import app from "./app.js";

if (process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT) || 5000;

  app.listen(port, () => {
    console.log(`Server running in ${process.env.NODE_ENV || "development"} mode on http://localhost:${port}`);
  });
}

export default app;
