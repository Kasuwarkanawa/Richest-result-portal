const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeEmail = (email) => {
  if (typeof email !== "string" || !email.trim()) {
    throw new TypeError("A valid email address is required");
  }
  return email.trim().toLowerCase();
};

const assertUuid = (id, label = "user") => {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new TypeError(`A valid PostgreSQL UUID is required for ${label} ID`);
  }
};

const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) {
    throw new TypeError(`Supabase ${operation} returned an invalid response`);
  }
  return rows;
};

const mapUserRow = (row) => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  mobileNo: row.mobile_no || "",
  passwordHash: row.password_hash,
  role: row.role,
  isActive: row.is_active,
  lastLoginAt: row.last_login_at ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null
});

export const toPublicSupabaseUser = (user, departmentIds = []) => {
  if (!user) return null;
  const { passwordHash: _passwordHash, password_hash: _passwordHashSnakeCase, ...safeUser } = user;
  return {
    _id: safeUser.id,
    fullName: safeUser.fullName,
    email: safeUser.email,
    mobileNo: safeUser.mobileNo,
    role: safeUser.role,
    departmentIds,
    isActive: safeUser.isActive,
    lastLoginAt: safeUser.lastLoginAt,
    createdAt: safeUser.createdAt,
    updatedAt: safeUser.updatedAt
  };
};

/**
 * Creates an isolated Supabase user repository.
 * Inject the server-only supabaseRequest function at the composition boundary.
 * This module is intentionally not wired into the live MongoDB auth service.
 */
export const createSupabaseUserRepository = ({ request } = {}) => {
  if (typeof request !== "function") {
    throw new TypeError("A server-side Supabase request function is required");
  }

  const findOneUser = async (query, operation) => {
    const rows = expectRows(await request("users", { query }), operation);
    if (rows.length > 1) {
      throw new Error(`Supabase ${operation} returned more than one user`);
    }
    return rows.length === 1 ? mapUserRow(rows[0]) : null;
  };

  return Object.freeze({
    findUserByNormalizedEmail: async (email) => {
      const normalizedEmail = normalizeEmail(email);
      const query = new URLSearchParams({
        select: "id,full_name,email,mobile_no,password_hash,role,is_active,last_login_at,created_at,updated_at",
        email: `eq.${normalizedEmail}`,
        limit: "2"
      }).toString();
      return findOneUser(query, "email lookup");
    },

    findUserById: async (id) => {
      assertUuid(id);
      const query = new URLSearchParams({
        select: "id,full_name,email,mobile_no,password_hash,role,is_active,last_login_at,created_at,updated_at",
        id: `eq.${id}`,
        limit: "2"
      }).toString();
      return findOneUser(query, "ID lookup");
    },

    listDepartmentIdsForUser: async (userId) => {
      assertUuid(userId);
      const query = new URLSearchParams({
        select: "department_id",
        user_id: `eq.${userId}`,
        order: "department_id.asc"
      }).toString();
      const rows = expectRows(
        await request("user_departments", { query }),
        "department membership lookup"
      );
      return rows.map((row) => row.department_id);
    },

    updateLastLoginAt: async (userId, timestamp = new Date()) => {
      assertUuid(userId);
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (Number.isNaN(date.getTime())) {
        throw new TypeError("A valid last-login timestamp is required");
      }
      await request("users", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${userId}` }).toString(),
        body: { last_login_at: date.toISOString() },
        prefer: "return=minimal"
      });
    }
  });
};
