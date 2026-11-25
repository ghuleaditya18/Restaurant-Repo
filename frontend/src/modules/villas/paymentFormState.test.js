import test from "node:test";
import assert from "node:assert/strict";

import {
  clearPaymentForm,
  DEFAULT_PAYMENT_FORM,
  getPaymentForm,
  setPaymentFormError,
  setPaymentFormField,
  validateInvoicePayment,
} from "./paymentFormState.js";

test("payment form state isolates amount, method, reference, and errors per invoice", () => {
  let forms = {};

  forms = setPaymentFormField(forms, 101, "amount", "2500");
  forms = setPaymentFormField(forms, 101, "method", "Card");
  forms = setPaymentFormField(forms, 101, "reference", "TXN-101");

  // Invoice 102 remains unaffected at default values
  assert.deepEqual(getPaymentForm(forms, 102), DEFAULT_PAYMENT_FORM);

  forms = setPaymentFormField(forms, 102, "amount", "1000");
  forms = setPaymentFormField(forms, 102, "method", "Cash");

  assert.equal(getPaymentForm(forms, 101).amount, "2500");
  assert.equal(getPaymentForm(forms, 101).method, "Card");
  assert.equal(getPaymentForm(forms, 101).reference, "TXN-101");
  assert.equal(getPaymentForm(forms, 102).amount, "1000");
  assert.equal(getPaymentForm(forms, 102).method, "Cash");
  assert.equal(getPaymentForm(forms, 102).reference, "");
});

test("clearing one invoice preserves other invoice rows and failed submission preserves error row", () => {
  let forms = {};
  forms = setPaymentFormField(forms, 1, "amount", "500");
  forms = setPaymentFormField(forms, 2, "amount", "1500");
  forms = setPaymentFormField(forms, 2, "method", "Net Banking");

  // Simulated failed submission on invoice 2 keeps values and sets row-specific error
  forms = setPaymentFormError(forms, 2, "Payment exceeds balance.");
  assert.equal(getPaymentForm(forms, 2).amount, "1500");
  assert.equal(getPaymentForm(forms, 2).method, "Net Banking");
  assert.equal(getPaymentForm(forms, 2).error, "Payment exceeds balance.");
  assert.equal(getPaymentForm(forms, 1).error, "");

  // Simulated successful submission on invoice 1 clears only invoice 1
  forms = clearPaymentForm(forms, 1);
  assert.deepEqual(getPaymentForm(forms, 1), DEFAULT_PAYMENT_FORM);
  assert.equal(getPaymentForm(forms, 2).amount, "1500");
  assert.equal(getPaymentForm(forms, 2).error, "Payment exceeds balance.");
});

test("validateInvoicePayment checks positive numeric bounds and payment methods", () => {
  assert.match(validateInvoicePayment({ amount: "", method: "UPI" }, 1000), /greater than zero/);
  assert.match(validateInvoicePayment({ amount: "-10", method: "UPI" }, 1000), /greater than zero/);
  assert.match(validateInvoicePayment({ amount: "1000.01", method: "UPI" }, 1000), /exceed remaining balance/);
  assert.match(validateInvoicePayment({ amount: "500", method: "Crypto" }, 1000), /valid payment method/);
  assert.equal(validateInvoicePayment({ amount: "1000", method: "UPI" }, 1000), "");
});
