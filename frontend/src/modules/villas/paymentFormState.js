export const DEFAULT_PAYMENT_FORM = Object.freeze({
  amount: "",
  method: "UPI",
  reference: "",
  error: "",
});

const ALLOWED_PAYMENT_METHODS = new Set(["UPI", "Card", "Net Banking", "Cash"]);

export function getPaymentForm(paymentForms, invoiceId) {
  return paymentForms?.[invoiceId] || DEFAULT_PAYMENT_FORM;
}

export function setPaymentFormField(paymentForms, invoiceId, fieldName, value) {
  const current = getPaymentForm(paymentForms, invoiceId);
  return {
    ...paymentForms,
    [invoiceId]: {
      ...current,
      [fieldName]: value,
      error: fieldName === "error" ? value : "",
    },
  };
}

export function setPaymentFormError(paymentForms, invoiceId, errorMessage) {
  const current = getPaymentForm(paymentForms, invoiceId);
  return {
    ...paymentForms,
    [invoiceId]: {
      ...current,
      error: errorMessage,
    },
  };
}

export function clearPaymentForm(paymentForms, invoiceId) {
  if (!paymentForms || !(invoiceId in paymentForms)) {
    return paymentForms || {};
  }
  const next = { ...paymentForms };
  delete next[invoiceId];
  return next;
}

export function validateInvoicePayment(formState, balanceDue) {
  const amountNum = Number(formState?.amount);
  const roundedBalance = Number(Number(balanceDue || 0).toFixed(2));
  if (!formState?.amount || !Number.isFinite(amountNum) || amountNum <= 0) {
    return "Enter a valid payment amount greater than zero.";
  }
  if (Number(amountNum.toFixed(2)) > roundedBalance) {
    return `Payment amount cannot exceed remaining balance (₹${roundedBalance.toFixed(2)}).`;
  }
  if (!ALLOWED_PAYMENT_METHODS.has(formState?.method)) {
    return "Select a valid payment method.";
  }
  return "";
}
