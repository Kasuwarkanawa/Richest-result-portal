import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupabaseCountFunction,
  parsePostgrestExactCount
} from "./supabaseCountAdapter.js";

test("parses exact PostgREST totals", () => {
  assert.equal(parsePostgrestExactCount("0-0/17"), 17);
  assert.equal(parsePostgrestExactCount("*/0"), 0);
});

test("rejects missing, inexact, and unsafe count metadata", () => {
  for (const value of [null, "", "0-0/*", "invalid", "0-0/9007199254740992"]) {
    assert.throws(() => parsePostgrestExactCount(value));
  }
});

test("requests only an exact count for an allowlisted table", async () => {
  const calls = [];
  const countRows = createSupabaseCountFunction({
    request: async (table, options) => {
      calls.push({ table, options });
      return { data: [], contentRange: "*/23" };
    }
  });

  assert.equal(await countRows("students"), 23);
  assert.deepEqual(calls, [{
    table: "students",
    options: {
      method: "GET",
      query: "select=id&limit=0",
      prefer: "count=exact",
      includeResponseMetadata: true
    }
  }]);
});

test("rejects tables outside the migration inventory before making a request", async () => {
  let called = false;
  const countRows = createSupabaseCountFunction({
    request: async () => { called = true; return { data: [], contentRange: "*/0" }; }
  });
  await assert.rejects(() => countRows("auth.users"), /allowlisted/);
  assert.equal(called, false);
});

test("rejects malformed response payloads", async () => {
  const countRows = createSupabaseCountFunction({
    request: async () => ({ data: {}, contentRange: "*/0" })
  });
  await assert.rejects(() => countRows("students"), /array payload/);
});
