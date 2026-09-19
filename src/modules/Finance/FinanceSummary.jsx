import { useMemo } from 'react'
import { calculateFinanceSummary } from './index.js'

const num = value => Number(value || 0)
const won = value => `${num(value).toLocaleString('ko-KR')}원`

const EXPENSE_LABEL = {
  international_air: '국제선 항공',
  domestic_air: '국내·현지 항공',
  hotel: '호텔',
  land: '랜드·지상비',
  tour: '투어',
  insurance: '보험',
  other: '기타·미분류',
}

export default function FinanceSummary({
  reservation,
  payments = [],
  expenses = [],
  canView = false,
}) {
  const relatedPayments = useMemo(
    () => payments.filter(item => item.reservation_id === reservation?.id),
    [payments, reservation?.id],
  )
  const relatedExpenses = useMemo(
    () => expenses.filter(item => item.reservation_id === reservation?.id),
    [expenses, reservation?.id],
  )

  const summary = useMemo(
    () => calculateFinanceSummary({
      saleAmount: reservation?.sale_amount,
      finalSaleAmount: reservation?.final_sale_amount,
      exchangeAdjustmentAmount: reservation?.exchange_adjustment_amount,
      additionalAmount: reservation?.additional_amount,
      discountAmount: 0,
      payments: relatedPayments,
      expenses: relatedExpenses,
    }),
    [reservation, relatedPayments, relatedExpenses],
  )

  const expenseBreakdown = useMemo(() => {
    const map = {}
    relatedExpenses.forEach(item => {
      const key = item.expense_type || 'other'
      map[key] = (map[key] || 0) + num(item.amount_krw)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [relatedExpenses])

  if (!canView) {
    return <div className="erpNotice">정산·손익 조회 권한이 필요합니다.</div>
  }

  return (
    <section className="erpWorkspace">
      <div className="erpWorkspaceHead">
        <div>
          <small>FINANCE SUMMARY</small>
          <h3>CASE 회계·손익</h3>
          <p>판매가, 실제 수납, 미수금, 등록 원가를 같은 예약 CASE 기준으로 계산합니다.</p>
        </div>
        <span className={`erpProfitBadge ${summary.profit < 0 ? 'loss' : ''}`}>
          예상수익 {won(summary.profit)}
        </span>
      </div>

      <div className="erpFinanceHero">
        <div><span>최종 매출</span><strong>{won(summary.finalSale)}</strong></div>
        <div><span>순수납</span><strong>{won(summary.received)}</strong></div>
        <div className={summary.receivable > 0 ? 'warn' : ''}><span>미수금</span><strong>{won(summary.receivable)}</strong></div>
        <div><span>총 원가</span><strong>{won(summary.totalCost)}</strong></div>
        <div className={summary.profit < 0 ? 'loss' : 'gain'}><span>예상수익</span><strong>{won(summary.profit)}</strong></div>
        <div><span>수익률</span><strong>{summary.margin.toFixed(1)}%</strong></div>
      </div>

      <div className="erpFinanceGrid">
        <article>
          <div className="erpWorkspaceHead compact">
            <div><small>PAYMENT</small><h4>입금 구성</h4></div>
            <b>{relatedPayments.length}건</b>
          </div>
          <div className="erpMiniList">
            {relatedPayments.map(item => (
              <div key={item.id}>
                <span>{item.payment_type === 'refund' ? '환불' : item.payment_type === 'deposit' ? '계약금' : item.payment_type === 'interim' ? '중도금' : item.payment_type === 'balance' ? '잔금' : '추가입금'}</span>
                <b>{item.payment_type === 'refund' ? '-' : ''}{won(item.amount)}</b>
              </div>
            ))}
            {!relatedPayments.length && <p>입금 내역 없음</p>}
          </div>
        </article>

        <article>
          <div className="erpWorkspaceHead compact">
            <div><small>COST</small><h4>원가 구성</h4></div>
            <b>{relatedExpenses.length}건</b>
          </div>
          <div className="erpMiniList">
            {expenseBreakdown.map(([type, amount]) => (
              <div key={type}>
                <span>{EXPENSE_LABEL[type] || type}</span>
                <b>{won(amount)}</b>
              </div>
            ))}
            {!expenseBreakdown.length && <p>등록 원가 없음</p>}
          </div>
        </article>
      </div>

      {(summary.receivable > 0 || expenseBreakdown.some(([type]) => type === 'other')) && (
        <div className="erpFinanceAlerts">
          {summary.receivable > 0 && <div>미수금 {won(summary.receivable)} 확인 필요</div>}
          {expenseBreakdown.some(([type]) => type === 'other') && <div>기타·미분류 원가가 있어 재분류 확인 필요</div>}
        </div>
      )}
    </section>
  )
}
