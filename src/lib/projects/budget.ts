export type BudgetLineFlag = {
  type: string
  amount: number
}

export type ProjectBudgetSummary = {
  incomeHkd: number
  expenseHkd: number
  netHkd: number
  lineCount: number
}

export function computeBudgetSummary(
  lines: BudgetLineFlag[] | null | undefined
): ProjectBudgetSummary {
  const list = lines || []
  let incomeHkd = 0
  let expenseHkd = 0
  for (const line of list) {
    const amount = Math.abs(Number(line.amount) || 0)
    if (line.type === 'INCOME') incomeHkd += amount
    else if (line.type === 'EXPENSE') expenseHkd += amount
  }
  return {
    incomeHkd,
    expenseHkd,
    netHkd: incomeHkd - expenseHkd,
    lineCount: list.length,
  }
}

export type ProjectFinanceVariance = {
  incomeVarianceHkd: number
  expenseVarianceHkd: number
  netVarianceHkd: number
}

/** Actual − budget (positive income = over target; positive expense = over budget). */
export function computeFinanceVariance(
  actual: { incomeHkd: number; expenseHkd: number },
  budget: ProjectBudgetSummary
): ProjectFinanceVariance {
  return {
    incomeVarianceHkd: actual.incomeHkd - budget.incomeHkd,
    expenseVarianceHkd: actual.expenseHkd - budget.expenseHkd,
    netVarianceHkd: actual.incomeHkd - actual.expenseHkd - budget.netHkd,
  }
}
