import { env } from "./env.js";

const getConfig = () => {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return {
    // Remove trailing URL slashes without introducing an invalid regex.
    baseUrl: env.supabaseUrl.replace(/\/+$/, ""),
    key: env.supabaseServiceRoleKey
  };
};

/** Server-only PostgREST request helper. Never import from frontend code. */
export const supabaseRequest = async (table, {
  method = "GET",
  query = "",
  body,
  prefer,
  headers = {},
  includeResponseMetadata = false
} = {}) => {
  const { baseUrl, key } = getConfig();
  const suffix = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  const response = await fetch(`${baseUrl}/rest/v1/${encodeURIComponent(table)}${suffix}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  const responseText = await response.text();
  let data = null;
  if (responseText) {
    try { data = JSON.parse(responseText); }
    catch { data = responseText; }
  }

  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || `Supabase request failed (${response.status})`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  if (includeResponseMetadata) {
    return {
      data,
      contentRange: response.headers.get("content-range")
    };
  }
  return data;
};

export const supabaseHealthCheck = async () => {
  const rows = await supabaseRequest("semesters", { query: "select=id&limit=1" });
  return { ok: true, checked: "public.semesters", sampleRows: rows.length };
};
