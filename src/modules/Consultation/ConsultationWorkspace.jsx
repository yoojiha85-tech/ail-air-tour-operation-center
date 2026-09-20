import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_LABEL = {
  new: '신규',
  contacting: '상담중',
  quoted: '견적발송',
  contracted: '계약완료',
  converted: '예약전환',
  hold: '보류',
  closed: '종료',
}

const SOURCE_LABEL = {
  'ail-travel-main': '온라인(홈페이지)',
  offline_phone: '전화상담',
  offline_walkin: '방문상담',
  offline_referral: '지인소개',
  offline_other: '기타(오프라인)',
}

const REQUEST_TYPE_OPTIONS = [
  '허니문 견적', '해외패키지 견적', '항공권 견적', '골프투어 견적',
  '호텔예약 견적', '제주 패키지', '단체·기업 문의', '기타 문의',
]

const STATUS_FILTERS = [
  ['open', '진행중(신규·상담중·견적·계약)'],
  ['new', '신규'],
  ['contacting', '상담중'],
  ['hold', '보류'],
  ['converted', '예약전환'],
  ['closed', '종료'],
  ['all', '전체'],
]

const OPEN_STATUSES = ['new', 'contacting', 'quoted', 'contracted']
const CANCUN_QUOTE_URL = 'https://ail-travel-main.netlify.app/admin/cancun-quote/'
const isCancun = value => /칸쿤|cancun/i.test(String(value || ''))

const SOURCE_FILTERS = [
  ['all', '전체 경로'],
  ['ail-travel-main', '온라인(홈페이지)'],
  ['offline_phone', '전화상담'],
  ['offline_walkin', '방문상담'],
  ['offline_referral', '지인소개'],
  ['offline_other', '기타(오프라인)'],
]

const ymd = value => (value ? String(value).slice(0, 10) : '-')

const hoursSince = value => (value ? (Date.now() - new Date(value).getTime()) / 3600000 : null)

const elapsedLabel = value => {
  const hours = hoursSince(value)
  if (hours === null) return '-'
  if (hours < 1) return '방금 접수'
  if (hours < 24) return `${Math.floor(hours)}시간 경과`
  return `${Math.floor(hours / 24)}일 경과`
}

const isOverdueNew = item => item.status === 'new' && (hoursSince(item.created_at) || 0) > 24

const emptyForm = () => ({
  request_type: '',
  customer_name: '',
  phone: '',
  destination: '',
  departure_date: '',
  traveler_count: '',
  budget: '',
  wedding_date: '',
  request_memo: '',
  source: 'offline_phone',
  privacy_consent: false,
})

export default function ConsultationWorkspace({
  organizationId,
  userId,
  canEdit = false,
  canCreate = false,
  onConverted,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [selected, setSelected] = useState(null)
  const [memoDraft, setMemoDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancunContext, setCancunContext] = useState(null)
  const [cancunLoading, setCancunLoading] = useState(false)

  async function load() {
    if (!organizationId) return
    setLoading(true)
    setError('')
    const result = await supabase
      .from('ops_consultations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (result.error) setError(result.error.message)
    setItems(result.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [organizationId])

  const summary = useMemo(() => {
    const open = items.filter(item => OPEN_STATUSES.includes(item.status))
    const fresh = items.filter(item => item.status === 'new')
    const overdue = fresh.filter(isOverdueNew)
    const todayStr = new Date().toISOString().slice(0, 10)
    const today = items.filter(item => String(item.created_at || '').slice(0, 10) === todayStr)
    return { open: open.length, fresh: fresh.length, overdue: overdue.length, today: today.length }
  }, [items])

  const filtered = useMemo(() => {
    let list = [...items]
    if (statusFilter === 'open') list = list.filter(item => OPEN_STATUSES.includes(item.status))
    else if (statusFilter !== 'all') list = list.filter(item => item.status === statusFilter)
    if (sourceFilter !== 'all') list = list.filter(item => item.source === sourceFilter)

    const term = search.trim()
    if (term) {
      const digitsOnly = term.replace(/[^0-9]/g, '')
      list = list.filter(item =>
        (item.customer_name || '').includes(term) ||
        (digitsOnly && (item.phone || '').replace(/[^0-9]/g, '').includes(digitsOnly)) ||
        (item.destination || '').includes(term) ||
        (item.request_code || '').toUpperCase().includes(term.toUpperCase()),
      )
    }

    list.sort((a, b) => {
      const aUrgent = a.status === 'new'
      const bUrgent = b.status === 'new'
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1
      if (aUrgent && bUrgent) return new Date(a.created_at) - new Date(b.created_at)
      return new Date(b.created_at) - new Date(a.created_at)
    })
    return list
  }, [items, statusFilter, sourceFilter, search])

  function openCreate() {
    if (!canCreate) return
    setForm(emptyForm())
  }

  async function saveCreate() {
    if (!canCreate || !form || saving) return
    const required = ['request_type', 'customer_name', 'phone', 'destination']
    if (required.some(key => !String(form[key] || '').trim())) {
      setError('상담유형·고객명·연락처·희망여행지는 필수 입력입니다.')
      return
    }
    if (!form.privacy_consent) {
      setError('개인정보 수집·이용 동의 확인 후 등록할 수 있습니다.')
      return
    }

    setSaving(true)
    setError('')
    const now = new Date().toISOString()
    const created = await supabase
      .from('ops_consultations')
      .insert({
        organization_id: organizationId,
        request_type: form.request_type.trim(),
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        destination: form.destination.trim(),
        departure_date: form.departure_date || null,
        traveler_count: form.traveler_count || null,
        budget: form.budget || null,
        wedding_date: form.wedding_date || null,
        request_memo: form.request_memo || null,
        privacy_consent: true,
        source: form.source,
        status: 'contacting',
        assigned_to: userId,
        first_contact_at: now,
      })
      .select('*')
      .single()

    if (created.error) {
      setError(created.error.message)
      setSaving(false)
      return
    }

    setForm(null)
    setSaving(false)
    await load()
    setSelected(created.data)
    setMemoDraft(created.data.internal_memo || '')
  }

  function openSelected(item) {
    setSelected(item)
    setMemoDraft(item.internal_memo || '')
    setError('')
    setCancunContext(null)
    if (isCancun(item.destination)) loadCancunContext(item)
  }

  async function loadCancunContext(item = selected) {
    if (!item?.request_code || !isCancun(item.destination)) return
    setCancunLoading(true)
    const result = await supabase.rpc('cancun_get_consultation_context', {
      p_request_code: item.request_code,
    })
    if (result.error) {
      setError(result.error.message)
      setCancunContext(null)
    } else {
      setCancunContext(result.data || null)
    }
    setCancunLoading(false)
  }

  function openCancunQuote() {
    if (!selected?.request_code) return
    const url = new URL(CANCUN_QUOTE_URL)
    url.searchParams.set('consultation', selected.request_code)
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }

  async function patchSelected(patch) {
    if (!canEdit || !selected || saving) return
    setSaving(true)
    setError('')
    const result = await supabase
      .from('ops_consultations')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', selected.id)
      .select('*')
      .single()

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setSelected(result.data)
    setSaving(false)
    await load()
  }

  async function startContact() {
    if (!selected) return
    const patch = { status: 'contacting' }
    if (!selected.first_contact_at) patch.first_contact_at = new Date().toISOString()
    if (!selected.assigned_to) patch.assigned_to = userId
    await patchSelected(patch)
  }

  async function saveMemo() {
    await patchSelected({ internal_memo: memoDraft || null })
  }

  async function changeStatus(status) {
    await patchSelected({ status })
  }

  async function convertToReservation() {
    if (!selected || !canCreate || !canEdit || saving) return
    if (selected.reservation_id) return
    if (!window.confirm(`${selected.customer_name} 고객 상담을 신규 예약으로 전환하시겠습니까?\n예약 상태는 '문의'로 생성됩니다.`)) return

    setSaving(true)
    setError('')
    const rpc = await supabase.rpc('convert_consultation_to_reservation', { p_consultation_id: selected.id })
    if (rpc.error) {
      setError(rpc.error.message)
      setSaving(false)
      return
    }

    const result = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data
    setSaving(false)
    if (!result?.reservation_id) {
      setError('예약 전환 결과를 확인할 수 없습니다.')
      return
    }

    await load()
    setSelected(null)
    await onConverted?.(result)
  }

  async function deleteSelected() {
    if (!canEdit || !selected || selected.reservation_id) return
    if (!window.confirm('이 상담 기록을 삭제하시겠습니까? 예약으로 전환되지 않은 기록만 삭제할 수 있습니다.')) return
    setSaving(true)
    const result = await supabase
      .from('ops_consultations')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', selected.id)

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setSelected(null)
    setSaving(false)
    await load()
  }

  if (loading) return <div className="erpEmpty">상담 기록을 불러오는 중...</div>

  return (
    <section className="erpWorkspace">
      <div className="erpWorkspaceHead">
        <div>
          <small>CONSULTATION LOG</small>
          <h3>상담기록 관리</h3>
          <p>온라인 문의와 전화·방문 등 오프라인 상담을 한 목록에서 관리하고, 상담 완료 건은 예약으로 전환합니다.</p>
        </div>
        {canCreate && (
          <button type="button" className="primary mini" onClick={openCreate}>
            + 오프라인 상담 등록
          </button>
        )}
      </div>

      {error && <div className="erpError">{error}</div>}

      <div className="erpConsultSummary">
        <div><span>진행중</span><b>{summary.open}건</b></div>
        <div><span>신규(미응대)</span><b>{summary.fresh}건</b></div>
        <div><span>오늘 접수</span><b>{summary.today}건</b></div>
        <div className={summary.overdue > 0 ? 'warn' : ''}><span>24시간 초과 미응대</span><b>{summary.overdue}건</b></div>
      </div>

      <div className="erpCaseDashboardFilters">
        <div>
          {STATUS_FILTERS.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={statusFilter === key ? 'active' : ''}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="erpCaseDashboardFiltersRight">
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            {SOURCE_FILTERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <input
            className="erpSearchInput"
            placeholder="고객명 · 연락처 · 여행지 · 상담코드 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="erpRequestTable">
        <div className="erpRequestRow header consultRow">
          <span>상태</span><span>상담번호</span><span>고객</span><span>여행지 · 희망일</span><span>접수경로</span><span>경과</span><span>예약전환</span>
        </div>
        {filtered.map(item => (
          <button
            type="button"
            key={item.id}
            className={`erpRequestRow clickable consultRow ${selected?.id === item.id ? 'selected' : ''}`}
            onClick={() => openSelected(item)}
          >
            <span className={`erpStatusBadge status-${item.status}`}>{STATUS_LABEL[item.status] || item.status}</span>
            <span className="erpConsultCode">{item.request_code}</span>
            <span>{item.customer_name} · {item.phone}</span>
            <span>{item.destination} · {ymd(item.departure_date)}</span>
            <span>{SOURCE_LABEL[item.source] || item.source}</span>
            <span className={isOverdueNew(item) ? 'erpUrgent' : ''}>{elapsedLabel(item.created_at)}</span>
            <span>{item.reservation_id ? '완료' : '-'}</span>
          </button>
        ))}

        {!filtered.length && (
          <div className="erpEmpty">조건에 맞는 상담 기록이 없습니다.</div>
        )}
      </div>

      {form && (
        <div className="erpEditor">
          <div className="erpEditorHead">
            <div><small>NEW OFFLINE CONSULTATION</small><h4>오프라인 상담 등록 (전화·방문)</h4></div>
            <button type="button" className="secondary mini" onClick={() => setForm(null)}>닫기</button>
          </div>

          <div className="erpFormGrid">
            <label>
              상담유형 *
              <input list="consultationRequestTypes" value={form.request_type} onChange={e => setForm({ ...form, request_type: e.target.value })} placeholder="예: 허니문 견적" />
              <datalist id="consultationRequestTypes">
                {REQUEST_TYPE_OPTIONS.map(option => <option value={option} key={option} />)}
              </datalist>
            </label>
            <label>
              접수경로 *
              <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                <option value="offline_phone">전화상담</option>
                <option value="offline_walkin">방문상담</option>
                <option value="offline_referral">지인소개</option>
                <option value="offline_other">기타</option>
              </select>
            </label>
            <label>
              고객명 *
              <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
            </label>
            <label>
              연락처 *
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
            </label>
            <label>
              희망여행지 *
              <input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} />
            </label>
            <label>
              출발예정일
              <input type="date" value={form.departure_date} onChange={e => setForm({ ...form, departure_date: e.target.value })} />
            </label>
            <label>
              여행인원
              <input value={form.traveler_count} onChange={e => setForm({ ...form, traveler_count: e.target.value })} placeholder="예: 2명" />
            </label>
            <label>
              예상예산
              <input value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="예: 1인 300만원" />
            </label>
            <label>
              예식일
              <input type="date" value={form.wedding_date} onChange={e => setForm({ ...form, wedding_date: e.target.value })} />
            </label>
          </div>

          <div className="erpFormGrid notes">
            <label className="span2">
              상담 요청사항
              <textarea rows="4" value={form.request_memo} onChange={e => setForm({ ...form, request_memo: e.target.value })} />
            </label>
          </div>

          <label className="erpConsentLabel">
            <input type="checkbox" checked={form.privacy_consent} onChange={e => setForm({ ...form, privacy_consent: e.target.checked })} />
            개인정보 수집·이용 동의를 (구두 또는 서면으로) 확인했습니다 *
          </label>

          <div className="erpEditorFoot">
            <span>등록 즉시 상태는 "상담중"으로 시작합니다.</span>
            <button type="button" className="primary" disabled={saving} onClick={saveCreate}>
              {saving ? '저장 중...' : '상담기록 저장'}
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="erpEditor">
          <div className="erpEditorHead">
            <div>
              <small>{selected.request_code} · {SOURCE_LABEL[selected.source] || selected.source}</small>
              <h4>{selected.customer_name} 상담 상세</h4>
            </div>
            <button type="button" className="secondary mini" onClick={() => setSelected(null)}>닫기</button>
          </div>

          <div className="erpMiniList">
            <div><span>상담번호</span><b>{selected.request_code}</b></div>
            <div><span>연락처</span><b>{selected.phone}</b></div>
            <div><span>희망여행지</span><b>{selected.destination}</b></div>
            <div><span>출발예정일</span><b>{ymd(selected.departure_date)}</b></div>
            <div><span>여행인원</span><b>{selected.traveler_count || '-'}</b></div>
            <div><span>예상예산</span><b>{selected.budget || '-'}</b></div>
            <div><span>예식일</span><b>{ymd(selected.wedding_date)}</b></div>
            {selected.request_memo && <p>{selected.request_memo}</p>}
          </div>

          {selected.reservation_id && (
            <div className="erpSuccess">이미 예약으로 전환된 상담입니다.</div>
          )}

          {isCancun(selected.destination) && (
            <div className="erpConsultQuotePanel">
              <div className="erpConsultQuoteHead">
                <div>
                  <small>CANCUN QUOTE LINK</small>
                  <b>칸쿤 견적 · 상담번호 연결</b>
                  <span>{selected.request_code} 한 건에 A–E 견적과 수정 버전을 계속 누적합니다.</span>
                </div>
                <div>
                  <button type="button" className="secondary mini" disabled={cancunLoading} onClick={() => loadCancunContext(selected)}>
                    {cancunLoading ? '조회 중...' : '이력 새로고침'}
                  </button>
                  {(canEdit || canCreate) && (
                    <button type="button" className="primary mini" onClick={openCancunQuote}>
                      칸쿤 요금 견적 작성
                    </button>
                  )}
                </div>
              </div>

              {cancunLoading && <div className="erpConsultQuoteEmpty">연결된 칸쿤 견적을 확인하는 중...</div>}

              {!cancunLoading && cancunContext && (
                <>
                  <div className="erpConsultQuoteGrid">
                    {(cancunContext.quotes || []).map(q => (
                      <div key={q.id} className="erpConsultQuoteItem">
                        <span>{q.slotCode || '-'}안 · v{q.latestVersion || 0}</span>
                        <b>{q.quoteNo}</b>
                        <strong>{q.finalPricePpKrw ? Number(q.finalPricePpKrw).toLocaleString('ko-KR') + '원/인' : '판매가 미확정'}</strong>
                        <small>{q.updatedAt ? new Date(q.updatedAt).toLocaleString('ko-KR') : '-'}</small>
                      </div>
                    ))}
                    {!(cancunContext.quotes || []).length && (
                      <div className="erpConsultQuoteEmpty">이 상담번호로 저장된 칸쿤 견적이 없습니다.</div>
                    )}
                  </div>
                  {!!(cancunContext.events || []).length && (
                    <div className="erpConsultTimeline">
                      <b>상담 · 견적 기록</b>
                      {(cancunContext.events || []).slice(0, 10).map(event => (
                        <span key={event.id}>
                          {event.createdAt ? new Date(event.createdAt).toLocaleString('ko-KR') : '-'} · {event.title}
                          {event.detail ? ` · ${event.detail}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="erpFormGrid">
            <label>
              상담상태
              <select value={selected.status} disabled={!canEdit} onChange={e => changeStatus(e.target.value)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="erpMoneyPreview">
              <span>최초 응대</span>
              <b>{selected.first_contact_at ? ymd(selected.first_contact_at) : '미응대'}</b>
            </div>
          </div>

          <div className="erpFormGrid notes">
            <label className="span2">
              내부메모 (고객에게 보이지 않음)
              <textarea rows="4" value={memoDraft} onChange={e => setMemoDraft(e.target.value)} disabled={!canEdit} />
            </label>
          </div>

          <div className="erpCardActions">
            <button type="button" className="secondary mini" onClick={() => { window.location.href = `tel:${String(selected.phone || '').replace(/[^0-9+]/g, '')}` }}>
              전화하기
            </button>
            {canEdit && (
              <button type="button" className="secondary mini" disabled={saving} onClick={saveMemo}>
                메모 저장
              </button>
            )}
            {canEdit && selected.status === 'new' && (
              <button type="button" className="secondary mini" disabled={saving} onClick={startContact}>
                상담 시작
              </button>
            )}
            {isCancun(selected.destination) && (canEdit || canCreate) && (
              <button type="button" className="primary mini" onClick={openCancunQuote}>
                칸쿤 견적 열기
              </button>
            )}
            {canCreate && canEdit && !selected.reservation_id && (
              <button type="button" className="primary mini" disabled={saving} onClick={convertToReservation}>
                예약으로 전환
              </button>
            )}
            {canEdit && !selected.reservation_id && (
              <button type="button" className="dangerText" disabled={saving} onClick={deleteSelected}>
                삭제
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
