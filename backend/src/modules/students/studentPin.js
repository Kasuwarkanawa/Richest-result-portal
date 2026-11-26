import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

export const generateStudentPin = () => String(randomInt(1000000000, 10000000000));
export const hashStudentPin = (pin) => bcrypt.hash(pin, 12);
// Always run a bcrypt comparison, even when a register number is unknown or an
// older student record has no PIN hash. This reduces account-enumeration timing leaks.
const dummyPinHash = bcrypt.hash("rigchest-invalid-pin-sentinel", 12);

export const verifyStudentPin = async (pin, hash) => {
  const comparisonHash = hash || await dummyPinHash;
  return bcrypt.compare(String(pin ?? ""), comparisonHash);
};
