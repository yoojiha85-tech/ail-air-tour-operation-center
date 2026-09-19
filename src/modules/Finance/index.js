const number = value => Number(value || 0)

export function calculateFinanceSummary({
  saleAmount = 0,
  additionalAmount = 0,
  discountAmount = 0,
  payments = [],
  expenses = [],
} = {}) {
  const finalSale =
    number(saleAmount) +
    number(additionalAmount) -
    number(discountAmount)

  const received = payments.reduce((sum, item) => {
    const amount = number(item.amount)
    return sum + (item.payment_type === 'refund' ? -amount : amount)
  }, 0)

  const totalCost = expenses.reduce((sum, item) => sum + number(item.amount_krw), 0)
  const receivable = Math.max(0, finalSale - received)
  const profit = finalSale - totalCost
  const margin = finalSale > 0 ? (profit / finalSale) * 100 : 0

  return {
    finalSale,
    received,
    receivable,
    totalCost,
    profit,
    margin,
  }
}
