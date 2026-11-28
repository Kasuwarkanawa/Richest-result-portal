import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ApiError } from "../../utils/apiError.js";
import { toPublicSupabaseUser } from "../users/supabaseUser.repository.js";

const POSTGRES_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Isolated PostgreSQL-backed authentication service.
 * It deliberately is not wired into auth.routes.js or the production composition
 * root. The existing MongoDB service remains the active implementation until
 * a separately approved cutover.
 */
export const createSupabaseAuthService = ({
  userRepository,
  accessSecret,
  refreshSecret,
  accessExpiresIn = "15m",
  refreshExpiresIn = "7d",
  clock = () => new Date()
} = {}) => {
  if (!userRepository) throw new TypeError("A Supabase user repository is required");
  if (!accessSecret || !refreshSecret) {
    throw new TypeError("JWT access and refresh secrets are required");
  }

  const createAccessToken = (user) => jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    accessSecret,
    { expiresIn: accessExpiresIn }
  );

  const createRefreshToken = (user) => jwt.sign(
    { userId: user.id },
    refreshSecret,
    { expiresIn: refreshExpiresIn }
  );

  return Object.freeze({
    loginUser: async ({ email, password }) => {
      const user = await userRepository.findUserByNormalizedEmail(email);
      if (!user) throw new ApiError(401, "Invalid email or password");
      if (!user.isActive) throw new ApiError(403, "Your account is inactive");

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new ApiError(401, "Invalid email or password");

      const accessToken = createAccessToken(user);
      const refreshToken = createRefreshToken(user);
      const lastLoginAt = clock();
      await userRepository.updateLastLoginAt(user.id, lastLoginAt);
      const departmentIds = await userRepository.listDepartmentIdsForUser(user.id);

      return {
        accessToken,
        refreshToken,
        user: toPublicSupabaseUser({ ...user, lastLoginAt }, departmentIds)
      };
    },

    getMe: async (userId) => {
      // Reject pre-cutover Mongo ObjectId JWTs explicitly; do not cast them to UUIDs.
      if (typeof userId !== "string" || !POSTGRES_UUID_PATTERN.test(userId)) {
        throw new ApiError(401, "Unauthorized access");
      }
      const user = await userRepository.findUserById(userId);
      if (!user) throw new ApiError(404, "User not found");
      const departmentIds = await userRepository.listDepartmentIdsForUser(user.id);
      return toPublicSupabaseUser(user, departmentIds);
    }
  });
};
