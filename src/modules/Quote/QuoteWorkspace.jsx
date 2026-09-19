import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
const QUOTE_STATUS = {
  draft: '작성중',
  sent: '견적발송',
  selected: '고객선택',
  expired: '만료',
  cancelled: '취소',
}

const num = value => Number(value || 0)
const won = value => `${num(value).toLocaleString('ko-KR')}원`
const emptyItem = () => ({
  item_type: 'hotel',
  item_name: '',
  description: '',
  quantity: 1,
  unit_price: '',
  customer_visible: true,
})

export default function QuoteWorkspace({
  reservation,
  organizationId,
  userId,
  canEdit = false,
  onChanged,
}) {
  const [quotes, setQuotes] = useState([])
  const [versions, setVersions] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (!reservation?.id) return
    setLoading(true)
    setError('')
    const q = await supabase
      .from('ops_quotes')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('reservation_id', reservation.id)
      .order('created_at', { ascending: true })

    if (q.error) {
      setError(q.error.message)
      setLoading(false)
      return
    }

    const quoteRows = q.data || []
    setQuotes(quoteRows)
    const quoteIds = quoteRows.map(row => row.id)
    if (!quoteIds.length) {
      setVersions([])
      setItems([])
      setLoading(false)
      return
    }

    const v = await supabase
      .from('ops_quote_versions')
      .select('*')
      .eq('organization_id', organizationId)
      .in('quote_id', quoteIds)
      .order('version_no', { ascending: false })

    if (v.error) {
      setError(v.error.message)
      setLoading(false)
      return
    }

    const versionRows = v.data || []
    setVersions(versionRows)
    const versionIds = versionRows.map(row => row.id)
    if (!versionIds.length) {
      setItems([])
      setLoading(false)
      return
    }

    const i = await supabase
      .from('ops_quote_items')
      .select('*')
      .eq('organization_id', organizationId)
      .in('quote_version_id', versionIds)
      .order('sort_order')

    if (i.error) setError(i.error.message)
    setItems(i.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [reservation?.id, organizationId])

  const latestByQuote = useMemo(() => {
    const map = {}
    for (const version of versions) {
      if (!map[version.quote_id] || version.version_no > map[version.quote_id].version_no) {
        map[version.quote_id] = version
      }
    }
    return map
  }, [versions])

  function openNewQuote() {
    const optionNo = quotes.length + 1
    setForm({
      mode: 'create',
      quoteId: null,
      title: `견적안 ${optionNo}`,
      valid_until: '',
      customer_note: '',
      internal_note: '',
      items: [emptyItem()],
    })
  }

  function openNewVersion(quote) {
    const latest = latestByQuote[quote.id]
    const sourceItems = latest
      ? items.filter(item => item.quote_version_id === latest.id)
      : []

    setForm({
      mode: 'version',
      quoteId: quote.id,
      title: quote.title,
      valid_until: quote.valid_until || '',
      customer_note: latest?.customer_note || '',
      internal_note: latest?.internal_note || '',
      items: sourceItems.length
        ? sourceItems.map(item => ({
            item_type: item.item_type,
            item_name: item.item_name,
            description: item.description || '',
            quantity: num(item.quantity) || 1,
            unit_price: num(item.unit_price),
            customer_visible: item.customer_visible !== false,
          }))
        : [emptyItem()],
    })
  }

  function changeItem(index, patch) {
    setForm(current => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }))
  }

  const formTotal = useMemo(
    () =>
      (form?.items || []).reduce(
        (sum, item) => sum + num(item.quantity || 1) * num(item.unit_price),
        0,
      ),
    [form],
  )

  async function saveQuote() {
    if (!canEdit || !form) return
    const cleanedItems = form.items.filter(item => String(item.item_name || '').trim())
    if (!cleanedItems.length) {
      setError('견적 항목을 1개 이상 입력해 주세요.')
      return
    }

    setSaving(true)
    setError('')
    let quoteId = form.quoteId

    if (form.mode === 'create') {
      const quoteCode = `Q-${String(reservation.reservation_code || 'AIL')}-${Date.now()}`
      const created = await supabase
        .from('ops_quotes')
        .insert({
          organization_id: organizationId,
          reservation_id: reservation.id,
          quote_code: quoteCode,
          title: form.title || '견적안',
          status: 'draft',
          currency: 'KRW',
          selected: false,
          valid_until: form.valid_until || null,
          created_by: userId,
        })
        .select('*')
        .single()

      if (created.error) {
        setError(created.error.message)
        setSaving(false)
        return
      }
      quoteId = created.data.id
    } else {
      const updated = await supabase
        .from('ops_quotes')
        .update({
          title: form.title || '견적안',
          valid_until: form.valid_until || null,
        })
        .eq('organization_id', organizationId)
        .eq('id', quoteId)

      if (updated.error) {
        setError(updated.error.message)
        setSaving(false)
        return
      }
    }

    const previousVersions = versions.filter(version => version.quote_id === quoteId)
    const versionNo =
      previousVersions.reduce((max, version) => Math.max(max, num(version.version_no)), 0) + 1

    const createdVersion = await supabase
      .from('ops_quote_versions')
      .insert({
        organization_id: organizationId,
        quote_id: quoteId,
        reservation_id: reservation.id,
        version_no: versionNo,
        total_amount: formTotal,
        customer_note: form.customer_note || null,
        internal_note: form.internal_note || null,
        snapshot: {
          reservation_code: reservation.reservation_code,
          customer_name: reservation.customer_name,
          destination: reservation.destination,
          departure_date: reservation.departure_date,
          return_date: reservation.return_date,
          traveler_count: reservation.traveler_count,
          title: form.title || '견적안',
        },
        created_by: userId,
      })
      .select('*')
      .single()

    if (createdVersion.error) {
      setError(createdVersion.error.message)
      setSaving(false)
      return
    }

    const payload = cleanedItems.map((item, index) => ({
      organization_id: organizationId,
      quote_version_id: createdVersion.data.id,
      item_type: item.item_type || 'other',
      item_name: String(item.item_name).trim(),
      description: item.description || null,
      quantity: num(item.quantity || 1),
      unit_price: num(item.unit_price),
      amount: num(item.quantity || 1) * num(item.unit_price),
      sort_order: index,
      customer_visible: item.customer_visible !== false,
    }))

    const savedItems = await supabase.from('ops_quote_items').insert(payload)
    if (savedItems.error) {
      setError(savedItems.error.message)
      setSaving(false)
      return
    }

    setForm(null)
    setSaving(false)
    await load()
    await onChanged?.()
  }

  async function selectQuote(quote) {
    if (!canEdit) return
    const latest = latestByQuote[quote.id]
    if (!latest) return

    setSaving(true)
    const reset = await supabase
      .from('ops_quotes')
      .update({ selected: false, status: 'sent' })
      .eq('organization_id', organizationId)
      .eq('reservation_id', reservation.id)

    if (reset.error) {
      setError(reset.error.message)
      setSaving(false)
      return
    }

    const picked = await supabase
      .from('ops_quotes')
      .update({ selected: true, status: 'selected' })
      .eq('organization_id', organizationId)
      .eq('id', quote.id)

    if (picked.error) {
      setError(picked.error.message)
      setSaving(false)
      return
    }

    const reservationUpdate = await supabase
      .from('ops_reservations')
      .update({
        selected_quote_id: quote.id,
        case_stage: 'quote',
      })
      .eq('organization_id', organizationId)
      .eq('id', reservation.id)

    if (reservationUpdate.error) {
      setError(reservationUpdate.error.message)
      setSaving(false)
      return
    }

    await supabase
      .from('ops_consultations')
      .update({ status: 'quoted', quoted_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('reservation_id', reservation.id)

    setSaving(false)
    await load()
    await onChanged?.()
  }

  if (loading) return <div className="erpEmpty">견적 정보를 불러오는 중...</div>

  return (
    <section className="erpWorkspace">
      <div className="erpWorkspaceHead">
        <div>
          <small>QUOTE WORKSPACE</small>
          <h3>견적관리</h3>
          <p>견적안을 덮어쓰지 않고 버전으로 보관하며, 고객이 선택한 견적을 계약 단계로 넘깁니다.</p>
        </div>
        {canEdit && (
          <button type="button" className="primary mini" onClick={openNewQuote}>
            + 견적안 추가
          </button>
        )}
      </div>

      {error && <div className="erpError">{error}</div>}

      <div className="erpQuoteGrid">
        {quotes.map(quote => {
          const latest = latestByQuote[quote.id]
          const quoteVersions = versions.filter(version => version.quote_id === quote.id)
          const latestItems = latest
            ? items.filter(item => item.quote_version_id === latest.id)
            : []

          return (
            <article className={`erpQuoteCard ${quote.selected ? 'selected' : ''}`} key={quote.id}>
              <div className="erpCardTop">
                <div>
                  <span>{quote.quote_code}</span>
                  <h4>{quote.title}</h4>
                </div>
                <em className={`erpStatus ${quote.status}`}>
                  {QUOTE_STATUS[quote.status] || quote.status}
                </em>
              </div>

              <strong className="erpQuoteTotal">{won(latest?.total_amount)}</strong>
              <p>최신 V{latest?.version_no || '-'} · 총 {quoteVersions.length}개 버전</p>

              <div className="erpMiniList">
                {latestItems.slice(0, 4).map(item => (
                  <div key={item.id}>
                    <span>{item.item_name}</span>
                    <b>{won(item.amount)}</b>
                  </div>
                ))}
              </div>

              <div className="erpCardActions">
                {canEdit && (
                  <button type="button" className="secondary mini" onClick={() => openNewVersion(quote)}>
                    새 버전
                  </button>
                )}
                {canEdit && !quote.selected && (
                  <button type="button" className="primary mini" disabled={saving} onClick={() => selectQuote(quote)}>
                    고객 선택
                  </button>
                )}
                {quote.selected && <span className="erpSelectedMark">계약 기준 견적</span>}
              </div>
            </article>
          )
        })}

        {!quotes.length && (
          <div className="erpEmpty span2">
            아직 등록된 견적이 없습니다. 첫 견적안을 생성하면 V1부터 이력이 시작됩니다.
          </div>
        )}
      </div>

      {form && (
        <div className="erpEditor">
          <div className="erpEditorHead">
            <div>
              <small>{form.mode === 'create' ? 'NEW QUOTE' : 'NEW VERSION'}</small>
              <h4>{form.mode === 'create' ? '견적안 작성' : '새 견적 버전 작성'}</h4>
            </div>
            <button type="button" className="secondary mini" onClick={() => setForm(null)}>
              닫기
            </button>
          </div>

          <div className="erpFormGrid">
            <label>
              견적명
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              유효기간
              <input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} />
            </label>
          </div>

          <div className="erpItemTable">
            <div className="erpItemHeader">
              <span>구분</span><span>항목</span><span>수량</span><span>단가</span><span>금액</span><span />
            </div>
            {form.items.map((item, index) => (
              <div className="erpItemRow" key={index}>
                <select value={item.item_type} onChange={e => changeItem(index, { item_type: e.target.value })}>
                  <option value="air">항공</option>
                  <option value="hotel">숙박</option>
                  <option value="land">랜드</option>
                  <option value="tour">투어</option>
                  <option value="option">옵션</option>
                  <option value="other">기타</option>
                </select>
                <input placeholder="항목명" value={item.item_name} onChange={e => changeItem(index, { item_name: e.target.value })} />
                <input type="number" min="0" step="1" value={item.quantity} onChange={e => changeItem(index, { quantity: e.target.value })} />
                <input type="number" min="0" step="1" value={item.unit_price} onChange={e => changeItem(index, { unit_price: e.target.value })} />
                <b>{won(num(item.quantity || 1) * num(item.unit_price))}</b>
                <button type="button" className="dangerText" onClick={() => setForm(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}>
                  삭제
                </button>
              </div>
            ))}
          </div>

          <button type="button" className="secondary mini" onClick={() => setForm(current => ({ ...current, items: [...current.items, emptyItem()] }))}>
            + 항목 추가
          </button>

          <div className="erpFormGrid notes">
            <label>
              고객 안내
              <textarea rows="3" value={form.customer_note} onChange={e => setForm({ ...form, customer_note: e.target.value })} />
            </label>
            <label>
              내부 메모
              <textarea rows="3" value={form.internal_note} onChange={e => setForm({ ...form, internal_note: e.target.value })} />
            </label>
          </div>

          <div className="erpEditorFoot">
            <div><span>견적 합계</span><strong>{won(formTotal)}</strong></div>
            <button type="button" className="primary" disabled={saving} onClick={saveQuote}>
              {saving ? '저장 중...' : form.mode === 'create' ? '견적 V1 저장' : '새 버전 저장'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
