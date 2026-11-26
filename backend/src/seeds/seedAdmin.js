import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User } from "../modules/users/user.model.js";
import { connectDB } from "../config/db.js";
import { ROLES } from "../config/constants.js";

const seedAdmin = async () => {
  try {
    const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    const fullName = process.env.INITIAL_ADMIN_NAME?.trim();
    const mobileNo = process.env.INITIAL_ADMIN_MOBILE?.trim();

    if (!email || !password || !fullName || !mobileNo) {
      throw new Error(
        "Set INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, INITIAL_ADMIN_NAME and INITIAL_ADMIN_MOBILE before running the admin seed."
      );
    }
    if (password.length < 12) {
      throw new Error("INITIAL_ADMIN_PASSWORD must contain at least 12 characters.");
    }

    await connectDB();

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      console.log("Configured super admin already exists; no changes made.");
      await mongoose.connection.close();
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({
      fullName,
      email,
      mobileNo,
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      isActive: true
    });

    console.log("Super admin created. Credentials were read from environment variables.");
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Seed admin failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seedAdmin();
