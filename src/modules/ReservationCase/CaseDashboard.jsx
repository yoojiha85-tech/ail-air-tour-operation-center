import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const num = value => Number(value || 0)
const won = value => `${num(value).toLocaleString('ko-KR')}원`
const ymd = value => value ? String(value).slice(0, 10) : '-'

const HEALTH = {
  danger: { label: '긴급', className: 'danger' },
  warning: { label: '확인필요', className: 'warning' },
  ready: { label: '정상', className: 'ready' },
}

const STAGE = {
  consultation: '상담',
  quote: '견적',
  contract: '계약',
  request: '예약의뢰',
  reservation: '예약',
  ticketing: '발권',
  balance: '잔금',
  briefing: '설명회',
  departure: '출발',
  returned: '귀국',
  settled: '정산',
}

export default function CaseDashboard({
  organizationId,
  onOpenCase,
}) {
  const [rows, setRows] = useState([])
  const [healthFilter, setHealthFilter] = useState('attention')
  const [productFilter, setProductFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const today = new Date().toISOString().slice(0, 10)
    const result = await supabase
      .from('ops_case_dashboard')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('departure_date', today)
      .order('departure_date', { ascending: true })

    if (result.error) setError(result.error.message)
    setRows(result.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [organizationId])

  const metrics = useMemo(() => ({
    cases: rows.length,
    danger: rows.filter(row => row.case_health === 'danger').length,
    warning: rows.filter(row => row.case_health === 'warning').length,
    due7: rows.reduce((sum, row) => sum + num(row.due_7_tasks), 0),
    overdue: rows.reduce((sum, row) => sum + num(row.overdue_tasks), 0),
    receivable: rows.reduce((sum, row) => sum + num(row.receivable_amount), 0),
    reconciliation: rows.reduce((sum, row) => sum + num(row.open_reconciliation_count), 0),
  }), [rows])

  const filtered = useMemo(() => {
    let list = [...rows]

    if (healthFilter === 'attention') {
      list = list.filter(row => row.case_health !== 'ready')
    } else if (healthFilter !== 'all') {
      list = list.filter(row => row.case_health === healthFilter)
    }

    if (productFilter !== 'all') {
      list = list.filter(row => row.product_type === productFilter)
    }

    return list.sort((a, b) => {
      const healthRank = { danger: 0, warning: 1, ready: 2 }
      return (healthRank[a.case_health] ?? 9) - (healthRank[b.case_health] ?? 9)
        || num(b.overdue_tasks) - num(a.overdue_tasks)
        || num(a.days_to_departure) - num(b.days_to_departure)
    })
  }, [rows, healthFilter, productFilter])

  if (loading) {
    return <section className="panel erpCaseDashboard"><div className="erpEmpty">CASE Dashboard를 불러오는 중...</div></section>
  }

  return (
    <section className="panel erpCaseDashboard">
      <div className="panelHead">
        <div>
          <h2>CASE Control Dashboard</h2>
          <p>상담·견적·계약·예약·D-Day 업무·미수금·자료대조를 하나의 CASE 기준으로 모니터링합니다.</p>
        </div>
        <button type="button" className="secondary mini" onClick={load}>새로고침</button>
      </div>

      {error && <div className="erpError">{error}</div>}

      <div className="erpCaseDashboardStats">
        <div><span>출발 예정 CASE</span><b>{metrics.cases}</b></div>
        <div className={metrics.danger ? 'danger' : ''}><span>긴급 CASE</span><b>{metrics.danger}</b></div>
        <div className={metrics.warning ? 'warn' : ''}><span>확인필요</span><b>{metrics.warning}</b></div>
        <div className={metrics.overdue ? 'danger' : ''}><span>지연 업무</span><b>{metrics.overdue}</b></div>
        <div><span>7일 내 업무</span><b>{metrics.due7}</b></div>
        <div className="money"><span>총 미수금</span><b>{won(metrics.receivable)}</b></div>
        <div className={metrics.reconciliation ? 'warn' : ''}><span>자료대조 미확인</span><b>{metrics.reconciliation}</b></div>
      </div>

      <div className="erpCaseDashboardFilters">
        <div>
          {[['attention','긴급·확인'],['danger','긴급'],['warning','확인필요'],['ready','정상'],['all','전체']].map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={healthFilter === key ? 'active' : ''}
              onClick={() => setHealthFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={productFilter} onChange={event => setProductFilter(event.target.value)}>
          <option value="all">전체 상품</option>
          <option value="honeymoon">허니문</option>
          <option value="package">해외패키지</option>
          <option value="air">해외항공권</option>
          <option value="group">단체</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="erpEmpty">선택한 조건의 CASE가 없습니다.</div>
      ) : (
        <div className="erpCaseDashboardList">
          {filtered.slice(0, 30).map(row => {
            const health = HEALTH[row.case_health] || HEALTH.ready
            const requestRate = num(row.request_item_count)
              ? Math.round(num(row.request_confirmed_count) / num(row.request_item_count) * 100)
              : 0

            return (
              <article className={`erpCaseDashboardRow ${health.className}`} key={row.reservation_id}>
                <div className="erpCaseIdentity">
                  <div>
                    <span className={`erpHealth ${health.className}`}>{health.label}</span>
                    <b>{row.customer_name}</b>
                    <small>{row.reservation_code} · {row.destination || row.product_type}</small>
                  </div>
                  <strong>{num(row.days_to_departure) >= 0 ? `D-${num(row.days_to_departure)}` : '출발완료'}</strong>
                </div>

                <div className="erpCaseProgress">
                  <div><span>현재단계</span><b>{STAGE[row.case_stage] || row.case_stage || '예약'}</b></div>
                  <div><span>다음업무</span><b>{row.next_task_label || '없음'}</b><small>{ymd(row.next_task_due_date)}</small></div>
                  <div><span>업무</span><b>{num(row.pending_tasks)}건</b><small>지연 {num(row.overdue_tasks)} · 7일내 {num(row.due_7_tasks)}</small></div>
                  <div><span>예약의뢰</span><b>{num(row.request_confirmed_count)}/{num(row.request_item_count)}</b><small>{requestRate}% 확정</small></div>
                  <div><span>예약등록</span><b>{num(row.air_count)}/{num(row.hotel_count)}/{num(row.land_count)}</b><small>항공 / 호텔 / 랜드</small></div>
                  <div><span>미수금</span><b>{won(row.receivable_amount)}</b><small>매출 {won(row.final_sale_amount)}</small></div>
                </div>

                {(num(row.open_reconciliation_count) > 0 || num(row.active_contract_count) === 0) && (
                  <div className="erpCaseWarnings">
                    {num(row.open_reconciliation_count) > 0 && <span>자료대조 {num(row.open_reconciliation_count)}건</span>}
                    {num(row.active_contract_count) === 0 && num(row.contract_count) > 0 && <span>활성 계약 확인</span>}
                    {num(row.contract_count) === 0 && <span>ERP 계약 미등록</span>}
                  </div>
                )}

                <div className="erpCaseDashboardActions">
                  <button type="button" className="secondary mini" onClick={() => onOpenCase?.(row.reservation_id, 'case')}>CASE 열기</button>
                  <button type="button" className="secondary mini" onClick={() => onOpenCase?.(row.reservation_id, 'finance')}>손익</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {filtered.length > 30 && <div className="todayCenterMore">우선순위 상위 30건 표시</div>}
    </section>
  )
}
