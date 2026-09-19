import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const SEVERITY_LABEL = { high: '중요', medium: '확인', low: '참고' }
const RESOLUTION_LABEL = {
  open: '미확인',
  keep_current: '현재값 유지',
  accept_source: '원본값 반영',
  explained: '차이 사유 확인',
  ignored: '무시',
}

export default function ReconciliationPanel({
  reservation,
  organizationId,
  userId,
  canEdit = false,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!reservation?.id) return
    setLoading(true)
    const result = await supabase
      .from('ops_source_reconciliations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('reservation_id', reservation.id)
      .order('created_at', { ascending: true })

    if (result.error) setError(result.error.message)
    setRows(result.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [reservation?.id, organizationId])

  const openCount = useMemo(
    () => rows.filter(row => row.resolution_status === 'open').length,
    [rows],
  )

  async function resolve(row, resolutionStatus) {
    if (!canEdit) return
    const result = await supabase
      .from('ops_source_reconciliations')
      .update({
        resolution_status: resolutionStatus,
        resolved_by: userId,
        resolved_at: resolutionStatus === 'open' ? null : new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .eq('id', row.id)

    if (result.error) {
      setError(result.error.message)
      return
    }
    await load()
  }

  if (loading) return <div className="erpEmpty">원본 자료 대조 정보를 불러오는 중...</div>
  if (!rows.length) return null

  return (
    <section className="erpReconcile">
      <div className="erpWorkspaceHead compact">
        <div>
          <small>SOURCE RECONCILIATION</small>
          <h4>원본 계약서 ↔ 운영 데이터 대조</h4>
        </div>
        <span className={`erpReconcileCount ${openCount ? 'open' : ''}`}>
          미확인 {openCount}건
        </span>
      </div>

      {error && <div className="erpError">{error}</div>}

      <div className="erpReconcileTable">
        <div className="erpReconcileRow header">
          <span>중요도</span><span>항목</span><span>원본 자료</span><span>현재 운영값</span><span>처리</span>
        </div>
        {rows.map(row => (
          <div className="erpReconcileRow" key={row.id}>
            <b className={`erpSeverity ${row.severity}`}>
              {SEVERITY_LABEL[row.severity] || row.severity}
            </b>
            <div>
              <strong>{row.field_label}</strong>
              <small>{row.source_name}</small>
            </div>
            <span>{row.source_value || '-'}</span>
            <span>{row.current_value || '-'}</span>
            {canEdit ? (
              <select
                value={row.resolution_status}
                onChange={e => resolve(row, e.target.value)}
              >
                {Object.entries(RESOLUTION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            ) : (
              <span>{RESOLUTION_LABEL[row.resolution_status] || row.resolution_status}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
