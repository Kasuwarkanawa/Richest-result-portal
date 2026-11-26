import mongoose from "mongoose";
import { env } from "./env.js";

let connectionPromise;

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(env.mongoUri, {
        serverSelectionTimeoutMS: 10000
      })
      .then((connection) => {
        console.log(`MongoDB connected: ${connection.connection.host}`);
        return connection;
      })
      .catch((error) => {
        connectionPromise = undefined;
        console.error("MongoDB connection failed:", error.message);
        throw error;
      });
  }

  return connectionPromise;
};
