import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CASE_STAGE_LABEL, CASE_STAGE_ORDER, normalizeCaseStage } from './index.js'

const REQUEST_STATUS = {
  draft: '작성중',
  requested: '예약요청',
  partial: '일부확정',
  confirmed: '전체확정',
  cancelled: '취소',
}

const ITEM_STATUS = {
  requested: '요청',
  checking: '확인중',
  confirmed: '확정',
  cancelled: '취소',
}

export default function ReservationCaseControlCenter({
  reservation,
  organizationId,
  userId,
  canEdit = false,
  onChanged,
}) {
  const [requests, setRequests] = useState([])
  const [requestItems, setRequestItems] = useState([])
  const [counts, setCounts] = useState({ quotes: 0, contracts: 0, air: 0, hotel: 0, land: 0 })
  const [currentStage, setCurrentStage] = useState(normalizeCaseStage(reservation?.case_stage))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (!reservation?.id) return
    setLoading(true)
    setError('')

    const [caseResult, requestResult, itemResult, quoteResult, contractResult, airResult, hotelResult, landResult] =
      await Promise.all([
        supabase.from('ops_reservations').select('case_stage,case_status').eq('organization_id', organizationId).eq('id', reservation.id).maybeSingle(),
        supabase.from('ops_reservation_requests').select('*').eq('organization_id', organizationId).eq('reservation_id', reservation.id).order('created_at', { ascending: false }),
        supabase.from('ops_reservation_request_items').select('*').eq('organization_id', organizationId).eq('reservation_id', reservation.id).order('sort_order'),
        supabase.from('ops_quotes').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('reservation_id', reservation.id),
        supabase.from('ops_contracts').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('reservation_id', reservation.id),
        supabase.from('ops_air_bookings').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('reservation_id', reservation.id),
        supabase.from('ops_hotel_bookings').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('reservation_id', reservation.id),
        supabase.from('ops_land_bookings').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('reservation_id', reservation.id),
      ])

    const firstError = [caseResult, requestResult, itemResult, quoteResult, contractResult, airResult, hotelResult, landResult].find(result => result.error)?.error
    if (firstError) setError(firstError.message)

    setRequests(requestResult.data || [])
    setRequestItems(itemResult.data || [])
    setCounts({
      quotes: quoteResult.count || 0,
      contracts: contractResult.count || 0,
      air: airResult.count || 0,
      hotel: hotelResult.count || 0,
      land: landResult.count || 0,
    })
    setCurrentStage(normalizeCaseStage(caseResult.data?.case_stage || reservation.case_stage || 'reservation'))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [reservation?.id, organizationId])

  const activeRequest = requests[0] || null
  const activeItems = useMemo(
    () => activeRequest ? requestItems.filter(item => item.request_id === activeRequest.id) : [],
    [activeRequest, requestItems],
  )

  async function updateStage(stage) {
    if (!canEdit) return
    setSaving(true)
    const result = await supabase
      .from('ops_reservations')
      .update({ case_stage: stage })
      .eq('organization_id', organizationId)
      .eq('id', reservation.id)

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setCurrentStage(stage)
    setSaving(false)
    await onChanged?.()
  }

  async function createRequest() {
    if (!canEdit) return
    setSaving(true)
    setError('')

    const requestCode = `REQ-${reservation.reservation_code}-${Date.now()}`
    const created = await supabase
      .from('ops_reservation_requests')
      .insert({
        organization_id: organizationId,
        reservation_id: reservation.id,
        request_code: requestCode,
        status: 'draft',
        created_by: userId,
      })
      .select('*')
      .single()

    if (created.error) {
      setError(created.error.message)
      setSaving(false)
      return
    }

    const defaultItems = [
      { service_type: 'air', request_detail: '국제선/필요 항공 예약 요청', sort_order: 1 },
      { service_type: 'hotel', request_detail: '호텔·리조트 객실 예약 요청', sort_order: 2 },
      { service_type: 'land', request_detail: '현지 랜드·트랜스퍼·투어 예약 요청', sort_order: 3 },
    ].map(item => ({
      ...item,
      organization_id: organizationId,
      request_id: created.data.id,
      reservation_id: reservation.id,
      status: 'requested',
      currency: 'KRW',
      foreign_amount: 0,
      cost_amount: 0,
    }))

    const inserted = await supabase.from('ops_reservation_request_items').insert(defaultItems)
    if (inserted.error) setError(inserted.error.message)

    await supabase
      .from('ops_reservations')
      .update({ case_stage: 'request' })
      .eq('organization_id', organizationId)
      .eq('id', reservation.id)

    setCurrentStage('request')
    setSaving(false)
    await load()
    await onChanged?.()
  }

  async function updateRequestStatus(status) {
    if (!canEdit || !activeRequest) return
    setSaving(true)
    const patch = {
      status,
      requested_at: status === 'requested' ? new Date().toISOString() : activeRequest.requested_at,
      requested_by: status === 'requested' ? userId : activeRequest.requested_by,
    }

    const result = await supabase
      .from('ops_reservation_requests')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', activeRequest.id)

    if (result.error) setError(result.error.message)
    setSaving(false)
    await load()
  }

  async function updateItem(item, patch) {
    if (!canEdit) return
    const result = await supabase
      .from('ops_reservation_request_items')
      .update({
        ...patch,
        confirmed_at: patch.status === 'confirmed'
          ? (item.confirmed_at || new Date().toISOString())
          : item.confirmed_at,
      })
      .eq('organization_id', organizationId)
      .eq('id', item.id)

    if (result.error) {
      setError(result.error.message)
      return
    }

    await load()
  }

  if (loading) return <div className="erpEmpty">CASE 정보를 불러오는 중...</div>

  const stageIndex = CASE_STAGE_ORDER.indexOf(currentStage)

  return (
    <section className="erpWorkspace">
      <div className="erpWorkspaceHead">
        <div>
          <small>RESERVATION CASE CONTROL CENTER</small>
          <h3>{reservation.customer_name} · {reservation.reservation_code}</h3>
          <p>상담부터 정산까지 하나의 CASE ID로 연결하며 현재 단계와 누락 업무를 한 화면에서 관리합니다.</p>
        </div>
        <span className="erpCaseStatus">{reservation.case_status || 'active'}</span>
      </div>

      {error && <div className="erpError">{error}</div>}

      <div className="erpStageBar">
        {CASE_STAGE_ORDER.map((stage, index) => (
          <button
            type="button"
            key={stage}
            disabled={!canEdit || saving}
            className={index < stageIndex ? 'done' : index === stageIndex ? 'active' : ''}
            onClick={() => updateStage(stage)}
          >
            <span>{index + 1}</span>
            <b>{CASE_STAGE_LABEL[stage]}</b>
          </button>
        ))}
      </div>

      <div className="erpCaseMetrics">
        <div><span>견적</span><b>{counts.quotes}안</b></div>
        <div><span>계약</span><b>{counts.contracts}건</b></div>
        <div><span>항공</span><b>{counts.air}건</b></div>
        <div><span>호텔</span><b>{counts.hotel}건</b></div>
        <div><span>랜드</span><b>{counts.land}건</b></div>
      </div>

      <div className="erpWorkspaceHead compact">
        <div>
          <small>RESERVATION REQUEST</small>
          <h4>예약의뢰</h4>
        </div>
        {canEdit && !activeRequest && (
          <button type="button" className="primary mini" disabled={saving} onClick={createRequest}>
            + 예약의뢰 생성
          </button>
        )}
      </div>

      {!activeRequest && (
        <div className="erpEmpty">계약 완료 후 항공·호텔·랜드 예약의뢰를 생성합니다.</div>
      )}

      {activeRequest && (
        <>
          <div className="erpRequestHead">
            <div>
              <span>{activeRequest.request_code}</span>
              <b>{REQUEST_STATUS[activeRequest.status] || activeRequest.status}</b>
            </div>
            {canEdit && (
              <select value={activeRequest.status} onChange={e => updateRequestStatus(e.target.value)}>
                <option value="draft">작성중</option>
                <option value="requested">예약요청</option>
                <option value="partial">일부확정</option>
                <option value="confirmed">전체확정</option>
                <option value="cancelled">취소</option>
              </select>
            )}
          </div>

          <div className="erpRequestTable">
            <div className="erpRequestRow header">
              <span>구분</span><span>거래처</span><span>요청내용</span><span>상태</span><span>확정번호</span>
            </div>
            {activeItems.map(item => (
              <div className="erpRequestRow" key={item.id}>
                <b>{({ air: '항공', hotel: '호텔', land: '랜드', tour: '투어', transport: '교통' })[item.service_type] || item.service_type}</b>
                {canEdit
                  ? <input defaultValue={item.supplier_name || ''} onBlur={e => updateItem(item, { supplier_name: e.target.value })} placeholder="거래처" />
                  : <span>{item.supplier_name || '-'}</span>}
                {canEdit
                  ? <input defaultValue={item.request_detail || ''} onBlur={e => updateItem(item, { request_detail: e.target.value })} />
                  : <span>{item.request_detail || '-'}</span>}
                {canEdit
                  ? <select value={item.status} onChange={e => updateItem(item, { status: e.target.value })}>
                      {Object.entries(ITEM_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  : <span>{ITEM_STATUS[item.status] || item.status}</span>}
                {canEdit
                  ? <input defaultValue={item.confirmation_no || ''} onBlur={e => updateItem(item, { confirmation_no: e.target.value })} placeholder="확정번호" />
                  : <span>{item.confirmation_no || '-'}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
