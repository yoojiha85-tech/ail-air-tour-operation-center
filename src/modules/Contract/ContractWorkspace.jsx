import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
const CONTRACT_STATUS = {
  draft: '작성중',
  sent: '발송',
  signed: '계약완료',
  superseded: '과거계약',
  cancelled: '취소',
}

const num = value => Number(value || 0)
const won = value => `${num(value).toLocaleString('ko-KR')}원`

export default function ContractWorkspace({
  reservation,
  organizationId,
  userId,
  canEdit = false,
  onChanged,
}) {
  const [contracts, setContracts] = useState([])
  const [selectedQuote, setSelectedQuote] = useState(null)
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (!reservation?.id) return
    setLoading(true)
    setError('')

    const [contractResult, quoteResult] = await Promise.all([
      supabase
        .from('ops_contracts')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('reservation_id', reservation.id)
        .order('version_no', { ascending: false }),
      supabase
        .from('ops_quotes')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('reservation_id', reservation.id)
        .eq('selected', true)
        .maybeSingle(),
    ])

    if (contractResult.error) setError(contractResult.error.message)
    setContracts(contractResult.data || [])

    const quote = quoteResult.data || null
    setSelectedQuote(quote)

    if (quote?.id) {
      const versionResult = await supabase
        .from('ops_quote_versions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('quote_id', quote.id)
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (versionResult.error) setError(versionResult.error.message)
      setSelectedVersion(versionResult.data || null)
    } else {
      setSelectedVersion(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [reservation?.id, organizationId])

  const activeContract = useMemo(() => contracts.find(row => row.is_active) || null, [contracts])
  const latestContract = useMemo(() => activeContract || contracts[0] || null, [activeContract, contracts])
  const currentSale = num(reservation.final_sale_amount ?? reservation.sale_amount)
  const contractGap = latestContract ? currentSale - num(latestContract.total_amount) : 0

  function openContractForm() {
    if (!selectedQuote || !selectedVersion) return
    const total = num(selectedVersion.total_amount)
    const defaultDeposit = Math.min(total, 1000000)

    setForm({
      total_amount: total,
      deposit_amount: defaultDeposit,
      interim_amount: 0,
      balance_amount: Math.max(0, total - defaultDeposit),
      balance_due_date: reservation.balance_due_date || '',
      special_terms: '',
      cancellation_terms: '',
    })
  }

  function updateMoney(field, value) {
    setForm(current => {
      const next = { ...current, [field]: value }
      if (field === 'total_amount' || field === 'deposit_amount' || field === 'interim_amount') {
        next.balance_amount = Math.max(
          0,
          num(next.total_amount) - num(next.deposit_amount) - num(next.interim_amount),
        )
      }
      return next
    })
  }

  async function saveContract() {
    if (!canEdit || !form || !selectedQuote || !selectedVersion) return
    setSaving(true)
    setError('')

    const versionNo = contracts.reduce((max, row) => Math.max(max, num(row.version_no)), 0) + 1
    const contractCode = `CTR-${reservation.reservation_code}`
    const contractDate = new Date().toISOString().slice(0, 10)

    const created = await supabase
      .from('ops_contracts')
      .insert({
        organization_id: organizationId,
        reservation_id: reservation.id,
        quote_id: selectedQuote.id,
        quote_version_id: selectedVersion.id,
        contract_code: contractCode,
        version_no: versionNo,
        status: 'draft',
        contract_date: contractDate,
        total_amount: num(form.total_amount),
        deposit_amount: num(form.deposit_amount),
        interim_amount: num(form.interim_amount),
        balance_amount: num(form.balance_amount),
        balance_due_date: form.balance_due_date || null,
        special_terms: form.special_terms || null,
        cancellation_terms: form.cancellation_terms || null,
        snapshot: {
          reservation_code: reservation.reservation_code,
          customer_name: reservation.customer_name,
          customer_phone: reservation.customer_phone,
          destination: reservation.destination,
          departure_date: reservation.departure_date,
          return_date: reservation.return_date,
          traveler_count: reservation.traveler_count,
          quote_code: selectedQuote.quote_code,
          quote_version: selectedVersion.version_no,
          quote_total: selectedVersion.total_amount,
        },
        source_type: 'workspace',
        is_active: false,
        created_by: userId,
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
    await onChanged?.()
  }

  async function signContract(contract) {
    if (!canEdit) return
    setSaving(true)
    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    const deactivated = await supabase
      .from('ops_contracts')
      .update({
        is_active: false,
        status: 'superseded',
        superseded_at: now,
        superseded_reason: '새 계약 버전 활성화',
      })
      .eq('organization_id', organizationId)
      .eq('reservation_id', reservation.id)
      .eq('is_active', true)
      .neq('id', contract.id)

    if (deactivated.error) {
      setError(deactivated.error.message)
      setSaving(false)
      return
    }

    const signed = await supabase
      .from('ops_contracts')
      .update({
        status: 'signed',
        is_active: true,
        signed_at: now,
        superseded_at: null,
        superseded_reason: null,
        contract_date: contract.contract_date || today,
      })
      .eq('organization_id', organizationId)
      .eq('id', contract.id)

    if (signed.error) {
      setError(signed.error.message)
      setSaving(false)
      return
    }

    const reservationUpdate = await supabase
      .from('ops_reservations')
      .update({
        active_contract_id: contract.id,
        contract_written: true,
        contract_date: contract.contract_date || today,
        sale_amount: num(contract.total_amount),
        balance_due_date: contract.balance_due_date || null,
        case_stage: 'contract',
      })
      .eq('organization_id', organizationId)
      .eq('id', reservation.id)

    if (reservationUpdate.error) setError(reservationUpdate.error.message)

    await supabase
      .from('ops_consultations')
      .update({ status: 'contracted' })
      .eq('organization_id', organizationId)
      .eq('reservation_id', reservation.id)

    setSaving(false)
    await load()
    await onChanged?.()
  }

  if (loading) return <div className="erpEmpty">계약 정보를 불러오는 중...</div>

  return (
    <section className="erpWorkspace">
      <div className="erpWorkspaceHead">
        <div>
          <small>CONTRACT WORKSPACE</small>
          <h3>여행계약서</h3>
          <p>고객 선택 견적을 계약 스냅샷으로 고정하여 이후 요금표 변경과 분리합니다.</p>
        </div>
        {canEdit && selectedQuote && selectedVersion && (
          <button type="button" className="primary mini" onClick={openContractForm}>
            + 선택견적으로 계약 생성
          </button>
        )}
      </div>

      {error && <div className="erpError">{error}</div>}

      {!selectedQuote && (
        <div className="erpNotice">
          먼저 Quote Workspace에서 고객이 선택한 견적안을 지정해야 계약서를 생성할 수 있습니다.
        </div>
      )}

      {latestContract && contractGap !== 0 && (
        <div className="erpNotice">
          계약 스냅샷 {won(latestContract.total_amount)}과 현재 운영 판매가 {won(currentSale)}가 {won(Math.abs(contractGap))} 차이납니다.
          계약 이후 항공·옵션·환율·추가금 변경 여부를 CASE 자료대조에서 확인하세요.
        </div>
      )}

      {selectedQuote && selectedVersion && (
        <div className="erpSelectedQuote">
          <div><span>선택견적</span><b>{selectedQuote.title} · V{selectedVersion.version_no}</b></div>
          <strong>{won(selectedVersion.total_amount)}</strong>
        </div>
      )}

      <div className="erpContractList">
        {contracts.map(contract => (
          <article className={`erpContractCard ${contract.is_active ? 'signed' : ''} ${contract.status === 'superseded' ? 'superseded' : ''}`} key={contract.id}>
            <div className="erpCardTop">
              <div>
                <span>{contract.contract_code} · V{contract.version_no}{contract.source_type === 'legacy_xlsx' ? ' · XLSX 이관' : ''}</span>
                <h4>{contract.is_active ? '현재 활성 계약' : contract.status === 'superseded' ? '과거 계약 스냅샷' : contract.status === 'signed' ? '계약 완료' : '계약서 초안'}</h4>
              </div>
              <em className={`erpStatus ${contract.status}`}>
                {CONTRACT_STATUS[contract.status] || contract.status}
              </em>
            </div>

            <div className="erpContractMoney">
              <div><span>총 여행대금</span><b>{won(contract.total_amount)}</b></div>
              <div><span>계약금</span><b>{won(contract.deposit_amount)}</b></div>
              <div><span>중도금</span><b>{won(contract.interim_amount)}</b></div>
              <div><span>잔금</span><b>{won(contract.balance_amount)}</b></div>
            </div>

            <p>잔금일 {contract.balance_due_date || '-'} · 계약일 {contract.contract_date || '-'}{contract.source_file_name ? ` · 출처 ${contract.source_file_name}` : ''}</p>

            {canEdit && !contract.is_active && !['signed','superseded','cancelled'].includes(contract.status) && (
              <div className="erpCardActions">
                <button type="button" className="primary mini" disabled={saving} onClick={() => signContract(contract)}>
                  계약 완료 처리
                </button>
              </div>
            )}
          </article>
        ))}

        {!contracts.length && (
          <div className="erpEmpty">아직 생성된 계약서가 없습니다.</div>
        )}
      </div>

      {form && (
        <div className="erpEditor">
          <div className="erpEditorHead">
            <div><small>CONTRACT DRAFT</small><h4>선택 견적 기반 계약서 생성</h4></div>
            <button type="button" className="secondary mini" onClick={() => setForm(null)}>닫기</button>
          </div>

          <div className="erpFormGrid four">
            <label>총 여행대금<input type="number" value={form.total_amount} onChange={e => updateMoney('total_amount', e.target.value)} /></label>
            <label>계약금<input type="number" value={form.deposit_amount} onChange={e => updateMoney('deposit_amount', e.target.value)} /></label>
            <label>중도금<input type="number" value={form.interim_amount} onChange={e => updateMoney('interim_amount', e.target.value)} /></label>
            <label>잔금<input type="number" readOnly value={form.balance_amount} /></label>
          </div>

          <div className="erpFormGrid">
            <label>잔금일<input type="date" value={form.balance_due_date} onChange={e => setForm({ ...form, balance_due_date: e.target.value })} /></label>
            <div className="erpMoneyPreview"><span>계약 기준 견적</span><b>{won(selectedVersion?.total_amount)}</b></div>
          </div>

          <div className="erpFormGrid notes">
            <label>특약사항<textarea rows="5" value={form.special_terms} onChange={e => setForm({ ...form, special_terms: e.target.value })} /></label>
            <label>취소·환불 규정<textarea rows="5" value={form.cancellation_terms} onChange={e => setForm({ ...form, cancellation_terms: e.target.value })} /></label>
          </div>

          <div className="erpEditorFoot">
            <span>계약서 생성 후에도 고객 서명/동의 전에는 초안 상태로 유지됩니다.</span>
            <button type="button" className="primary" disabled={saving} onClick={saveContract}>
              {saving ? '저장 중...' : '계약서 초안 저장'}
            </button>
          </div>
        </div>
      )}

      {activeContract?.status === 'signed' && (
        <div className="erpSuccess">현재 활성 계약 V{activeContract.version_no}이 계약완료 상태입니다.</div>
      )}
    </section>
  )
}
