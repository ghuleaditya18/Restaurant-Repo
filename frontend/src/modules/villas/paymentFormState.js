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

/**
 * Compute Full Payment and 2-Installment (50% pre-stay + final 50%) amounts for a villa invoice.
 */
export function computeInstallmentPlan(invoice) {
  const totalAmount = Number(Number(invoice?.total_amount || 0).toFixed(2));
  const paidAmount = Number(Number(invoice?.paid_amount || 0).toFixed(2));
  const balanceDue = Number(
    Number(invoice?.balance_due ?? Math.max(0, totalAmount - paidAmount)).toFixed(2)
  );
  const halfTotal = Number((totalAmount / 2).toFixed(2));
  const firstInstallmentAmount = Number(Math.min(balanceDue, halfTotal).toFixed(2));
  const remainingToHalf = Number(Math.max(0, halfTotal - paidAmount).toFixed(2));
  const hasPriorPayment = paidAmount > 0;

  return {
    totalAmount,
    paidAmount,
    balanceDue,
    halfTotal,
    firstInstallmentAmount,
    remainingToHalf,
    hasPriorPayment,
  };
}

export function validateInvoicePayment(formState, balanceDue, invoice = null) {
  const amountNum = Number(formState?.amount);
  const roundedBalance = Number(Number(balanceDue || 0).toFixed(2));
  if (!formState?.amount || !Number.isFinite(amountNum) || amountNum <= 0) {
    return "Enter a valid payment amount greater than zero.";
  }
  const roundedAmount = Number(amountNum.toFixed(2));
  if (roundedAmount > roundedBalance) {
    return `Payment amount cannot exceed remaining balance (₹${roundedBalance.toFixed(2)}).`;
  }
  if (!ALLOWED_PAYMENT_METHODS.has(formState?.method)) {
    return "Select a valid payment method.";
  }

  if (invoice) {
    const { paidAmount, firstInstallmentAmount } = computeInstallmentPlan(invoice);
    const isFullRemaining = Math.abs(roundedAmount - roundedBalance) <= 0.01;
    if (!isFullRemaining) {
      if (paidAmount > 0) {
        return `Partial payments are limited to 2 installments. Please pay the final balance (₹${roundedBalance.toFixed(2)}).`;
      }
      if (roundedAmount + 0.01 < firstInstallmentAmount) {
        return `Partial payments allow 2 installments: at least 50% (₹${firstInstallmentAmount.toFixed(2)}) must be paid before stay.`;
      }
    }
  }
  return "";
}
