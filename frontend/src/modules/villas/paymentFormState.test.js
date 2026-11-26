import test from "node:test";
import assert from "node:assert/strict";

import {
  clearPaymentForm,
  computeInstallmentPlan,
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

test("2-installment partial payment rules enforce 50% first installment and final 2nd installment", () => {
  const unpaid = { total_amount: 19824, paid_amount: 0, balance_due: 19824 };
  const plan = computeInstallmentPlan(unpaid);
  assert.equal(plan.firstInstallmentAmount, 9912);
  assert.equal(plan.hasPriorPayment, false);

  // Less than 50% rejected
  assert.match(
    validateInvoicePayment({ amount: "5000", method: "UPI" }, 19824, unpaid),
    /at least 50%/
  );
  // Exact 50% accepted as 1st installment, Full balance accepted
  assert.equal(validateInvoicePayment({ amount: "9912", method: "UPI" }, 19824, unpaid), "");
  assert.equal(validateInvoicePayment({ amount: "19824", method: "UPI" }, 19824, unpaid), "");

  // Second installment must clear remaining balance
  const second = { total_amount: 19824, paid_amount: 9912, balance_due: 9912 };
  assert.match(
    validateInvoicePayment({ amount: "5000", method: "UPI" }, 9912, second),
    /limited to 2 installments/
  );
  assert.equal(validateInvoicePayment({ amount: "9912", method: "UPI" }, 9912, second), "");
});
