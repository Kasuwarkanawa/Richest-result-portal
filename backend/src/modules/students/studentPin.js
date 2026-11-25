import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

export const generateStudentPin = () => String(randomInt(1000000000, 10000000000));
export const hashStudentPin = (pin) => bcrypt.hash(pin, 12);
export const verifyStudentPin = (pin, hash) => bcrypt.compare(pin, hash);
