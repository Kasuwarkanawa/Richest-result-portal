import test from "node:test";
import assert from "node:assert/strict";
import { generateStudentPin, hashStudentPin, verifyStudentPin } from "./studentPin.js";

test("generated student PIN is a cryptographically random 10-digit string", () => {
  const pin = generateStudentPin();
  assert.match(pin, /^\d{10}$/);
});

test("student PIN hash verifies only the original PIN", async () => {
  const pin = generateStudentPin();
  const hash = await hashStudentPin(pin);
  assert.notEqual(hash, pin);
  assert.equal(await verifyStudentPin(pin, hash), true);
  assert.equal(await verifyStudentPin("0000000000", hash), false);
});


test("PIN verification safely rejects a missing hash", async () => {
  assert.equal(await verifyStudentPin("1234567890", null), false);
});
