import test from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeMobileInput,
  validateEmailAddress,
  validateMobileNumber,
} from "./validation.js";

test("sanitizeMobileInput strips non-digits and caps at 10 digits", () => {
  assert.equal(sanitizeMobileInput("9876543210999"), "9876543210");
  assert.equal(sanitizeMobileInput("98-765 4321a0"), "9876543210");
});

test("validateMobileNumber accepts valid 10-digit Indian mobiles and optional +91 prefix", () => {
  assert.deepEqual(validateMobileNumber("9876543210"), {
    valid: true,
    normalized: "9876543210",
    error: "",
  });
  assert.deepEqual(validateMobileNumber("+91 98100 11223"), {
    valid: true,
    normalized: "9810011223",
    error: "",
  });
  assert.equal(validateMobileNumber("", { required: false }).valid, true);
});

test("validateMobileNumber rejects random multi-digit, short, or invalid prefix numbers", () => {
  assert.equal(validateMobileNumber("789955441265125").valid, false);
  assert.equal(validateMobileNumber("1234567").valid, false);
  assert.equal(validateMobileNumber("5123456789").valid, false);
  assert.equal(validateMobileNumber("98765").valid, false);
  assert.equal(validateMobileNumber("").valid, false);
});

test("validateEmailAddress enforces strict email syntax", () => {
  assert.deepEqual(validateEmailAddress("Contact@Resort.IN "), {
    valid: true,
    normalized: "contact@resort.in",
    error: "",
  });
  assert.equal(validateEmailAddress("", { required: false }).valid, true);
  assert.equal(validateEmailAddress("", { required: true }).valid, false);
  assert.equal(validateEmailAddress("bad@domain").valid, false);
  assert.equal(validateEmailAddress("bad..name@domain.com").valid, false);
  assert.equal(validateEmailAddress("bad@domain.c").valid, false);
});
