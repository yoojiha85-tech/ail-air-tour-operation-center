import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  LayoutDashboard, Users, ShieldCheck, Save, X, LogIn, LogOut,
  UserRound, LoaderCircle, LockKeyhole, CalendarDays,
  CreditCard, ReceiptText, WalletCards, RefreshCw, Plus, Eye, Pencil, Trash2, ClipboardCheck
} from 'lucide-react'

const permissionLabels = {
  dashboard_view: '대시보드',
  reservation_view: '예약 조회',
  reservation_create: '예약 등록',
  reservation_edit: '예약 수정',
  reservation_delete: '예약 삭제',
  payment_view: '결제 조회',
  payment_manage: '결제 관리',
  expense_view: '지출 조회',
  expense_manage: '지출 관리',
  settlement_view: '정산 조회',
  settlement_print: '정산 출력',
  air_vi_view: 'AIR VI 조회',
  air_vi_manage: 'AIR VI 관리',
  calendar_view: '캘린더',
  ops_checklist_manage: '체크리스트',
  staff_manage: '직원 관리',
}

const defaultPermissions = Object.fromEntries(
  Object.keys(permissionLabels).map((key) => [key, false])
)

const roleLabel = {
  master: 'MASTER',
  manager: 'MANAGER',
  staff: 'STAFF',
  viewer: 'VIEWER',
}

const menuDefs = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, permission: 'dashboard_view' },
  { id: 'reservations', label: '예약', icon: CalendarDays, permission: 'reservation_view' },
  { id: 'payments', label: '결제', icon: CreditCard, permission: 'payment_view' },
  { id: 'settlements', label: '정산', icon: WalletCards, permission: 'settlement_view' },
  { id: 'staff', label: '직원 관리', icon: Users, permission: 'staff_manage' },
]

function hasPermission(member, key) {
  if (!member) return false
  if (member.role === 'master') return true
  return member.permissions?.[key] === true
}

function money(v) {
  return `${Number(v || 0).toLocaleString('ko-KR')}원`
}

function dateText(v) {
  return v || '-'
}

function friendlyAuthError(message = '') {
  const t = message.toLowerCase()
  if (t.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (t.includes('email not confirmed')) return '이메일 인증이 완료되지 않았습니다.'
  if (t.includes('too many requests')) return '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.'
  return message || '로그인 중 오류가 발생했습니다.'
}

function LoginScreen({ onLogin, loading, error }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function submit(e) {
    e.preventDefault()
    await onLogin(email.trim(), password)
  }

  return (
    <div className="login-page">
      <section className="login-visual">
        <div className="login-brand">AIL AIR TOUR<span>Operation Center</span></div>
        <div className="login-copy">
          <span className="eyebrow">INTERNAL OPERATIONS</span>
          <h1>아일항공여행사<br/>통합 운영센터</h1>
          <p>예약 · 결제 · 정산 · 직원 권한을 하나의 시스템에서 안전하게 관리합니다.</p>
        </div>
      </section>

      <section className="login-panel-wrap">
        <form className="login-card" onSubmit={submit}>
          <div className="login-icon"><LockKeyhole size={24}/></div>
          <h2>관리자 로그인</h2>
          <p>등록된 직원 계정으로 로그인해 주세요.</p>

          <label>
            이메일
            <input type="email" autoComplete="email" placeholder="name@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
              required disabled={loading}/>
          </label>

          <label>
            비밀번호
            <input type="password" autoComplete="current-password" placeholder="비밀번호 입력"
              value={password} onChange={e => setPassword(e.target.value)}
              required disabled={loading}/>
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={18}/> : <LogIn size={18}/>}
            로그인
          </button>

          <div className="login-foot">승인된 임직원 전용 시스템</div>
        </form>
      </section>
    </div>
  )
}

function EmptyState({ children }) {
  return <div className="empty">{children}</div>
}

export default function App() {
  const organizationId = import.meta.env.VITE_ORGANIZATION_ID

  const [session, setSession] = useState(null)
  const [currentMember, setCurrentMember] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [profileError, setProfileError] = useState('')

  const [activePage, setActivePage] = useState('dashboard')
  const [pageLoading, setPageLoading] = useState(false)
  const [pageError, setPageError] = useState('')

  const [reservations, setReservations] = useState([])
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [members, setMembers] = useState([])

  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(null)
  const [message, setMessage] = useState('')
  const [reservationModal, setReservationModal] = useState(null)
  const [reservationForm, setReservationForm] = useState(null)
  const [reservationSaving, setReservationSaving] = useState(false)
  const [reservationError, setReservationError] = useState('')

  const currentYear = new Date().getFullYear()
  const [settlementYear, setSettlementYear] = useState(currentYear)
  const [settlementMonth, setSettlementMonth] = useState('all')
  const [settlementStartDate, setSettlementStartDate] = useState(`${currentYear}-01-01`)
  const [settlementEndDate, setSettlementEndDate] = useState(`${currentYear}-12-31`)
  const [settlementFilterMode, setSettlementFilterMode] = useState('yearMonth')

  const visibleMenus = useMemo(
    () => menuDefs.filter(item => hasPermission(currentMember, item.permission)),
    [currentMember]
  )

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setAuthLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setCurrentMember(null)
        setReservations([])
        setPayments([])
        setExpenses([])
        setMembers([])
        setProfileError('')
      }
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user?.id || !organizationId) return
    loadCurrentMember(session.user.id)
  }, [session?.user?.id, organizationId])

  useEffect(() => {
    if (!currentMember) return
    const firstAllowed = menuDefs.find(item => hasPermission(currentMember, item.permission))
    if (!firstAllowed) return
    if (!hasPermission(currentMember, menuDefs.find(m => m.id === activePage)?.permission)) {
      setActivePage(firstAllowed.id)
    }
  }, [currentMember])

  useEffect(() => {
    if (!currentMember) return
    loadPage(activePage)
  }, [activePage, currentMember?.user_id])

  useEffect(() => {
    if (!currentMember || !organizationId) return

    let refreshTimer = null
    const refreshVisiblePage = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => loadPage(activePage), 250)
    }

    const channel = supabase
      .channel(`ops-realtime-${organizationId}-${currentMember.user_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ops_reservations',
        filter: `organization_id=eq.${organizationId}`
      }, refreshVisiblePage)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ops_payments',
        filter: `organization_id=eq.${organizationId}`
      }, refreshVisiblePage)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ops_expenses',
        filter: `organization_id=eq.${organizationId}`
      }, refreshVisiblePage)
      .subscribe()

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      supabase.removeChannel(channel)
    }
  }, [activePage, currentMember?.user_id, organizationId])

  async function handleLogin(email, password) {
    setLoginLoading(true)
    setLoginError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginError(friendlyAuthError(error.message))
    setLoginLoading(false)
  }

  async function handleLogout() {
    setSelected(null)
    setForm(null)
    setMessage('')
    await supabase.auth.signOut()
  }

  async function loadCurrentMember(userId) {
    setProfileError('')
    const { data, error } = await supabase
      .from('ops_members')
      .select('organization_id,user_id,email,display_name,role,active,permissions,created_at')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      setCurrentMember(null)
      setProfileError(`직원 권한 정보를 불러오지 못했습니다: ${error.message}`)
      return
    }
    if (!data) {
      setCurrentMember(null)
      setProfileError('이 계정은 아일항공여행사 직원으로 등록되어 있지 않습니다.')
      return
    }
    if (!data.active) {
      setCurrentMember(null)
      setProfileError('현재 비활성화된 계정입니다. MASTER 관리자에게 문의해 주세요.')
      return
    }
    setCurrentMember(data)
  }

  async function loadPage(page) {
    setPageError('')
    setPageLoading(true)

    try {
      if (page === 'dashboard') await loadDashboard()
      if (page === 'reservations') await loadReservations()
      if (page === 'payments') await loadPayments()
      if (page === 'settlements') await loadSettlements()
      if (page === 'staff') await loadMembers()
    } finally {
      setPageLoading(false)
    }
  }

  async function loadReservations() {
    if (!hasPermission(currentMember, 'reservation_view')) return
    const { data, error } = await supabase
      .from('ops_reservations')
      .select('id,organization_id,reservation_code,product_type,title,destination,customer_name,customer_phone,partner_name,manager_name,departure_date,return_date,traveler_count,status,settlement_status,sale_amount,memo,created_at,updated_at,reservation_channel,groom_phone,bride_phone,contract_date,balance_notice_done,final_check_done,insurance_done,gift_done,contract_written,groom_passport_checked,bride_passport_checked,briefing_notice_done,briefing_at,partner_remittance_deadline,partner_remittance_done,partner_remittance_date,partner_remittance_amount,partner_remittance_note,airline,air_pnr,ticketing_deadline,ticketed,ticketed_at,supplier_confirmation_received,groom_passport_expiry,bride_passport_expiry,balance_due_date,free_cancel_deadline,travel_docs_delivered,honeymoon_benefit_requested,air_ticket_amount,air_vi_amount,created_by')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) setPageError(error.message)
    else setReservations(data ?? [])
  }


  function makeReservationCode() {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const rand = Math.floor(Math.random() * 900 + 100)
    return `AIL-${stamp}-${rand}`
  }

  function emptyReservation() {
    return {
      reservation_code: makeReservationCode(),
      product_type: 'honeymoon',
      title: '',
      destination: '',
      customer_name: '',
      customer_phone: '',
      partner_name: '',
      manager_name: currentMember?.display_name || '',
      departure_date: '',
      return_date: '',
      traveler_count: 2,
      status: 'confirmed',
      settlement_status: 'unsettled',
      sale_amount: 0,
      memo: '',
      reservation_channel: '',
      groom_phone: '',
      bride_phone: '',
      contract_date: '',
      balance_notice_done: false,
      final_check_done: false,
      insurance_done: false,
      gift_done: false,
      contract_written: false,
      groom_passport_checked: false,
      bride_passport_checked: false,
      briefing_notice_done: false,
      briefing_at: '',
      partner_remittance_deadline: '',
      partner_remittance_done: false,
      partner_remittance_date: '',
      partner_remittance_amount: 0,
      partner_remittance_note: '',
      airline: '',
      air_pnr: '',
      ticketing_deadline: '',
      ticketed: false,
      ticketed_at: '',
      supplier_confirmation_received: false,
      groom_passport_expiry: '',
      bride_passport_expiry: '',
      balance_due_date: '',
      free_cancel_deadline: '',
      travel_docs_delivered: false,
      honeymoon_benefit_requested: false,
      air_ticket_amount: 0,
      air_vi_amount: 0,
    }
  }

  function openReservationCreate() {
    if (!hasPermission(currentMember, 'reservation_create')) return
    setReservationError('')
    setReservationForm(emptyReservation())
    setReservationModal('create')
  }

  function openReservationView(reservation) {
    setReservationError('')
    setReservationForm({ ...reservation })
    setReservationModal('view')
  }

  function openReservationEdit(reservation) {
    if (!hasPermission(currentMember, 'reservation_edit')) return
    setReservationError('')
    setReservationForm({
      ...reservation,
      departure_date: reservation.departure_date || '',
      return_date: reservation.return_date || '',
      contract_date: reservation.contract_date || '',
      briefing_at: reservation.briefing_at ? reservation.briefing_at.slice(0,16) : '',
      partner_remittance_deadline: reservation.partner_remittance_deadline || '',
      partner_remittance_date: reservation.partner_remittance_date || '',
      ticketing_deadline: reservation.ticketing_deadline || '',
      ticketed_at: reservation.ticketed_at || '',
      groom_passport_expiry: reservation.groom_passport_expiry || '',
      bride_passport_expiry: reservation.bride_passport_expiry || '',
      balance_due_date: reservation.balance_due_date || '',
      free_cancel_deadline: reservation.free_cancel_deadline || '',
    })
    setReservationModal('edit')
  }

  function cleanReservationPayload(form) {
    const dateFields = [
      'departure_date','return_date','contract_date','partner_remittance_deadline',
      'partner_remittance_date','ticketing_deadline','ticketed_at','groom_passport_expiry',
      'bride_passport_expiry','balance_due_date','free_cancel_deadline'
    ]
    const payload = { ...form }
    delete payload.id
    delete payload.organization_id
    delete payload.created_at
    delete payload.updated_at
    delete payload.created_by

    dateFields.forEach(k => {
      if (payload[k] === '') payload[k] = null
    })
    if (payload.briefing_at === '') payload.briefing_at = null

    payload.traveler_count = Math.max(1, Number(payload.traveler_count || 1))
    payload.sale_amount = Math.max(0, Number(payload.sale_amount || 0))
    payload.partner_remittance_amount = Math.max(0, Number(payload.partner_remittance_amount || 0))
    payload.air_ticket_amount = Math.max(0, Number(payload.air_ticket_amount || 0))
    payload.air_vi_amount = Math.max(0, Number(payload.air_vi_amount || 0))

    return payload
  }

  async function saveReservation() {
    if (!reservationForm) return
    const isCreate = reservationModal === 'create'
    if (isCreate && !hasPermission(currentMember, 'reservation_create')) return
    if (!isCreate && !hasPermission(currentMember, 'reservation_edit')) return

    if (!reservationForm.reservation_code?.trim() || !reservationForm.title?.trim() || !reservationForm.customer_name?.trim()) {
      setReservationError('예약번호, 상품명, 고객명은 필수입니다.')
      return
    }

    setReservationSaving(true)
    setReservationError('')
    const payload = cleanReservationPayload(reservationForm)

    let result
    if (isCreate) {
      result = await supabase.from('ops_reservations').insert({
        ...payload,
        organization_id: organizationId,
        created_by: session.user.id,
      })
    } else {
      result = await supabase.from('ops_reservations')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('id', reservationForm.id)
    }

    if (result.error) {
      setReservationError(result.error.message)
      setReservationSaving(false)
      return
    }

    setReservationModal(null)
    setReservationForm(null)
    setReservationSaving(false)
    await loadReservations()
  }

  async function deleteReservation(reservation) {
    if (!hasPermission(currentMember, 'reservation_delete')) return
    const ok = window.confirm(`${reservation.customer_name} 고객의 예약(${reservation.reservation_code})을 삭제하시겠습니까?\\n삭제 후 복구할 수 없습니다.`)
    if (!ok) return

    const { error } = await supabase.from('ops_reservations')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', reservation.id)

    if (error) {
      setPageError(error.message)
      return
    }
    await loadReservations()
  }

  async function loadPayments() {
    if (!hasPermission(currentMember, 'payment_view')) return

    const [{ data: payData, error: payError }, { data: reservationData }] = await Promise.all([
      supabase
        .from('ops_payments')
        .select('id,reservation_id,payment_date,payment_type,payment_method,amount,note,created_at')
        .eq('organization_id', organizationId)
        .order('payment_date', { ascending: false })
        .limit(100),
      supabase
        .from('ops_reservations')
        .select('id,reservation_code,customer_name,title')
        .eq('organization_id', organizationId)
    ])

    if (payError) {
      setPageError(payError.message)
      return
    }

    const reservationMap = Object.fromEntries(
      (reservationData ?? []).map(r => [r.id, r])
    )
    setPayments((payData ?? []).map(p => ({ ...p, reservation: reservationMap[p.reservation_id] })))
  }

  async function loadSettlements() {
    if (!hasPermission(currentMember, 'settlement_view')) return

    const [r, p, e] = await Promise.all([
      supabase.from('ops_reservations')
        .select('id,reservation_code,customer_name,title,departure_date,status,settlement_status,sale_amount')
        .eq('organization_id', organizationId)
        .order('departure_date', { ascending: false }),
      supabase.from('ops_payments')
        .select('reservation_id,amount')
        .eq('organization_id', organizationId),
      supabase.from('ops_expenses')
        .select('reservation_id,amount_krw,status')
        .eq('organization_id', organizationId),
    ])

    const error = r.error || p.error || e.error
    if (error) {
      setPageError(error.message)
      return
    }

    setReservations(r.data ?? [])
    setPayments(p.data ?? [])
    setExpenses(e.data ?? [])
  }

  async function loadDashboard() {
    if (!hasPermission(currentMember, 'dashboard_view')) return

    const promises = []
    promises.push(
      supabase.from('ops_reservations')
        .select('id,reservation_code,title,destination,customer_name,departure_date,status,settlement_status,sale_amount,created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(100)
    )

    if (hasPermission(currentMember, 'payment_view')) {
      promises.push(
        supabase.from('ops_payments')
          .select('id,reservation_id,payment_date,amount')
          .eq('organization_id', organizationId)
      )
    } else promises.push(Promise.resolve({ data: [], error: null }))

    if (hasPermission(currentMember, 'expense_view') || hasPermission(currentMember, 'settlement_view')) {
      promises.push(
        supabase.from('ops_expenses')
          .select('id,reservation_id,amount_krw,status,due_date')
          .eq('organization_id', organizationId)
      )
    } else promises.push(Promise.resolve({ data: [], error: null }))

    const [r, p, e] = await Promise.all(promises)
    const error = r.error || p.error || e.error
    if (error) {
      setPageError(error.message)
      return
    }

    setReservations(r.data ?? [])
    setPayments(p.data ?? [])
    setExpenses(e.data ?? [])
  }

  async function loadMembers() {
    if (!hasPermission(currentMember, 'staff_manage')) return

    const { data, error } = await supabase
      .from('ops_members')
      .select('organization_id,user_id,email,display_name,role,active,permissions,created_at')
      .eq('organization_id', organizationId)
      .order('created_at')

    if (error) setPageError(error.message)
    else setMembers(data ?? [])
  }

  function openEdit(member) {
    if (!hasPermission(currentMember, 'staff_manage') || member.role === 'master') return
    setSelected(member)
    setForm({
      display_name: member.display_name ?? '',
      role: member.role,
      active: member.active,
      permissions: { ...defaultPermissions, ...(member.permissions ?? {}) },
    })
    setMessage('')
  }

  async function saveMember() {
    if (!selected || !form || !hasPermission(currentMember, 'staff_manage')) return
    setMessage('저장 중...')

    const { error } = await supabase.rpc('ops_update_staff_member', {
      target_organization_id: selected.organization_id,
      target_user_id: selected.user_id,
      new_display_name: form.display_name,
      new_role: form.role,
      new_active: form.active,
      new_permissions: form.permissions,
    })

    if (error) {
      setMessage(`저장 오류: ${error.message}`)
      return
    }

    setSelected(null)
    setForm(null)
    await loadMembers()
  }

  const dashboardStats = useMemo(() => {
    const reservationCount = reservations.length
    const saleTotal = reservations.reduce((s, r) => s + Number(r.sale_amount || 0), 0)
    const paymentTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount_krw || 0), 0)
    return { reservationCount, saleTotal, paymentTotal, expenseTotal }
  }, [reservations, payments, expenses])

  const settlementRows = useMemo(() => {
    const paidMap = {}
    payments.forEach(p => {
      paidMap[p.reservation_id] = (paidMap[p.reservation_id] || 0) + Number(p.amount || 0)
    })
    const expenseMap = {}
    expenses.forEach(e => {
      expenseMap[e.reservation_id] = (expenseMap[e.reservation_id] || 0) + Number(e.amount_krw || 0)
    })

    return reservations.map(r => {
      const sale = Number(r.sale_amount || 0)
      const paid = paidMap[r.id] || 0
      const expense = expenseMap[r.id] || 0
      return {
        ...r,
        paid,
        expense,
        balance: sale - paid,
        expectedProfit: sale - expense,
      }
    })
  }, [reservations, payments, expenses])

  const settlementYears = useMemo(() => {
    const years = new Set([currentYear])
    reservations.forEach(r => {
      const y = Number(String(r.departure_date || '').slice(0, 4))
      if (y) years.add(y)
    })
    return [...years].sort((a, b) => b - a)
  }, [reservations, currentYear])

  const filteredSettlementRows = useMemo(() => {
    return settlementRows.filter(r => {
      if (!r.departure_date) return false
      const date = String(r.departure_date).slice(0, 10)
      if (settlementFilterMode === 'range') {
        if (settlementStartDate && date < settlementStartDate) return false
        if (settlementEndDate && date > settlementEndDate) return false
        return true
      }
      const year = Number(date.slice(0, 4))
      const month = Number(date.slice(5, 7))
      if (year !== Number(settlementYear)) return false
      if (settlementMonth !== 'all' && month !== Number(settlementMonth)) return false
      return true
    })
  }, [settlementRows, settlementFilterMode, settlementYear, settlementMonth, settlementStartDate, settlementEndDate])

  const settlementSummary = useMemo(() => filteredSettlementRows.reduce((acc, r) => {
    acc.count += 1
    acc.sale += Number(r.sale_amount || 0)
    acc.paid += Number(r.paid || 0)
    acc.expense += Number(r.expense || 0)
    acc.balance += Number(r.balance || 0)
    acc.profit += Number(r.expectedProfit || 0)
    return acc
  }, { count: 0, sale: 0, paid: 0, expense: 0, balance: 0, profit: 0 }), [filteredSettlementRows])

  function applySettlementYear(year) {
    const y = Number(year)
    setSettlementYear(y)
    setSettlementFilterMode('yearMonth')
    setSettlementStartDate(`${y}-01-01`)
    setSettlementEndDate(`${y}-12-31`)
  }

  function setSettlementQuickRange(type) {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    if (type === 'year') {
      applySettlementYear(y)
      setSettlementMonth('all')
    }
    if (type === 'month') {
      setSettlementYear(y)
      setSettlementMonth(String(now.getMonth() + 1))
      setSettlementFilterMode('yearMonth')
    }
    if (type === 'today') {
      const today = `${y}-${m}-${String(now.getDate()).padStart(2, '0')}`
      setSettlementStartDate(today)
      setSettlementEndDate(today)
      setSettlementFilterMode('range')
    }
  }

  if (authLoading) {
    return <div className="boot-screen"><LoaderCircle className="spin" size={30}/><span>시스템 확인 중...</span></div>
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} loading={loginLoading} error={loginError}/>
  }

  if (!currentMember) {
    return (
      <div className="access-page">
        <div className="access-card">
          <ShieldCheck size={34}/>
          <h2>접근 권한 확인</h2>
          <p>{profileError || '직원 권한 정보를 확인하고 있습니다.'}</p>
          <div className="signed-email">{session.user.email}</div>
          <button onClick={handleLogout}><LogOut size={17}/> 로그아웃</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">AIL AIR TOUR<span>Operation Center</span></div>

        <nav>
          {visibleMenus.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={activePage === item.id ? 'active' : ''}
                onClick={() => setActivePage(item.id)}
              >
                <Icon size={18}/> {item.label}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-user">
          <div className="avatar"><UserRound size={17}/></div>
          <div className="sidebar-user-copy">
            <strong>{currentMember.display_name || currentMember.email}</strong>
            <span>{roleLabel[currentMember.role] || currentMember.role}</span>
          </div>
          <button className="logout-mini" onClick={handleLogout} title="로그아웃"><LogOut size={17}/></button>
        </div>
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <h1>{menuDefs.find(m => m.id === activePage)?.label || '운영센터'}</h1>
            <p>로그인 계정에 부여된 권한 기준으로 메뉴와 데이터를 표시합니다.</p>
          </div>

          <div className="header-actions">
            <button className="refresh-btn" onClick={() => loadPage(activePage)} disabled={pageLoading}>
              <RefreshCw size={16} className={pageLoading ? 'spin' : ''}/> 새로고침
            </button>
            <div className={`account-badge ${currentMember.role}`}>
              <ShieldCheck size={16}/>
              {roleLabel[currentMember.role] || currentMember.role}
            </div>
          </div>
        </header>

        {pageError && <div className="error-banner">데이터 조회 오류: {pageError}</div>}

        {pageLoading ? (
          <div className="page-loading"><LoaderCircle className="spin" size={25}/> 데이터 불러오는 중...</div>
        ) : (
          <>
            {activePage === 'dashboard' && (
              <>
                <section className="kpis four">
                  <div className="kpi"><span>예약 건수</span><strong>{dashboardStats.reservationCount}</strong></div>
                  <div className="kpi"><span>총 판매액</span><strong className="money">{money(dashboardStats.saleTotal)}</strong></div>
                  <div className="kpi"><span>수금액</span><strong className="money">{money(dashboardStats.paymentTotal)}</strong></div>
                  <div className="kpi"><span>지출액</span><strong className="money">{money(dashboardStats.expenseTotal)}</strong></div>
                </section>

                <section className="panel">
                  <div className="panel-head"><div><h2>최근 예약</h2><p>최근 등록된 예약 최대 8건</p></div></div>
                  {reservations.length === 0 ? <EmptyState>등록된 예약이 없습니다.</EmptyState> : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>예약번호</th><th>고객</th><th>상품</th><th>출발일</th><th>상태</th><th>판매액</th></tr></thead>
                        <tbody>
                          {reservations.slice(0,8).map(r => (
                            <tr key={r.id}>
                              <td className="code">{r.reservation_code}</td>
                              <td>{r.customer_name}</td>
                              <td>{r.title}</td>
                              <td>{dateText(r.departure_date)}</td>
                              <td><span className="table-status">{r.status}</span></td>
                              <td className="amount">{money(r.sale_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}

            {activePage === 'reservations' && (
              <section className="panel">
                <div className="panel-head">
                  <div><h2>예약 목록</h2><p>예약 등록부터 출발 전 업무 체크까지 한 화면에서 관리합니다.</p></div>
                  {hasPermission(currentMember, 'reservation_create') &&
                    <button className="primary-action" onClick={openReservationCreate}><Plus size={16}/> 예약 등록</button>}
                </div>

                {reservations.length === 0 ? <EmptyState>등록된 예약이 없습니다.</EmptyState> : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>예약번호</th><th>고객</th><th>지역</th><th>출발일</th><th>인원</th>
                          <th>담당</th><th>예약상태</th><th>정산상태</th><th>판매액</th><th>업무진행</th><th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reservations.map(r => {
                          const checks = [
                            r.contract_written, r.groom_passport_checked, r.bride_passport_checked,
                            r.ticketed, r.balance_notice_done, r.final_check_done, r.insurance_done,
                            r.gift_done, r.briefing_notice_done, r.travel_docs_delivered,
                            r.honeymoon_benefit_requested, r.supplier_confirmation_received
                          ]
                          const done = checks.filter(Boolean).length
                          return (
                            <tr key={r.id}>
                              <td className="code">{r.reservation_code}</td>
                              <td><strong>{r.customer_name}</strong><div className="subtext">{r.customer_phone || '-'}</div></td>
                              <td>{r.destination || '-'}</td>
                              <td>{dateText(r.departure_date)}</td>
                              <td>{r.traveler_count}명</td>
                              <td>{r.manager_name || '-'}</td>
                              <td><span className="table-status">{r.status}</span></td>
                              <td>{r.settlement_status}</td>
                              <td className="amount">{money(r.sale_amount)}</td>
                              <td><span className="progress-chip"><ClipboardCheck size={13}/>{done}/12</span></td>
                              <td>
                                <div className="row-actions">
                                  <button title="상세보기" onClick={() => openReservationView(r)}><Eye size={15}/></button>
                                  {hasPermission(currentMember, 'reservation_edit') &&
                                    <button title="수정" onClick={() => openReservationEdit(r)}><Pencil size={15}/></button>}
                                  {hasPermission(currentMember, 'reservation_delete') &&
                                    <button className="danger-icon" title="삭제" onClick={() => deleteReservation(r)}><Trash2 size={15}/></button>}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activePage === 'payments' && (
              <section className="panel">
                <div className="panel-head">
                  <div><h2>결제 내역</h2><p>예약별 수금 내역을 확인합니다.</p></div>
                  {hasPermission(currentMember, 'payment_manage') &&
                    <button className="primary-action">+ 결제 등록</button>}
                </div>
                {payments.length === 0 ? <EmptyState>등록된 결제 내역이 없습니다.</EmptyState> : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>결제일</th><th>예약번호</th><th>고객</th><th>결제구분</th><th>방법</th><th>금액</th><th>메모</th></tr></thead>
                      <tbody>
                        {payments.map(p => (
                          <tr key={p.id}>
                            <td>{dateText(p.payment_date)}</td>
                            <td className="code">{p.reservation?.reservation_code || '-'}</td>
                            <td>{p.reservation?.customer_name || '-'}</td>
                            <td>{p.payment_type}</td>
                            <td>{p.payment_method}</td>
                            <td className="amount">{money(p.amount)}</td>
                            <td>{p.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activePage === 'settlements' && (
              <>
                <section className="panel settlement-filter-panel">
                  <div className="panel-head">
                    <div><h2>정산 기간 조회</h2><p>출발일 기준으로 연도 · 월 · 직접 기간을 선택해 조회합니다.</p></div>
                    <div className="settlement-quick-actions">
                      <button className="secondary" onClick={() => setSettlementQuickRange('today')}>오늘</button>
                      <button className="secondary" onClick={() => setSettlementQuickRange('month')}>이번 달</button>
                      <button className="secondary" onClick={() => setSettlementQuickRange('year')}>올해</button>
                    </div>
                  </div>

                  <div className="settlement-filters">
                    <label>기준연도
                      <select value={settlementYear} onChange={e => applySettlementYear(e.target.value)}>
                        {settlementYears.map(y => <option key={y} value={y}>{y}년</option>)}
                      </select>
                    </label>
                    <label>월 선택
                      <select value={settlementMonth} onChange={e => { setSettlementMonth(e.target.value); setSettlementFilterMode('yearMonth') }}>
                        <option value="all">1월 ~ 12월 전체</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                      </select>
                    </label>
                    <label>시작일
                      <input type="date" value={settlementStartDate} onChange={e => { setSettlementStartDate(e.target.value); setSettlementFilterMode('range') }}/></label>
                    <label>종료일
                      <input type="date" value={settlementEndDate} onChange={e => { setSettlementEndDate(e.target.value); setSettlementFilterMode('range') }}/></label>
                    <div className="settlement-filter-status">
                      <span>현재 조회</span>
                      <strong>{settlementFilterMode === 'range'
                        ? `${settlementStartDate || '시작'} ~ ${settlementEndDate || '종료'}`
                        : `${settlementYear}년 ${settlementMonth === 'all' ? '1월~12월' : `${settlementMonth}월`}`}</strong>
                    </div>
                  </div>
                </section>

                <section className="kpis settlement-kpis">
                  <div className="kpi"><span>예약 건수</span><strong>{settlementSummary.count}</strong></div>
                  <div className="kpi"><span>총 매출</span><strong className="money">{money(settlementSummary.sale)}</strong></div>
                  <div className="kpi"><span>고객 입금액</span><strong className="money">{money(settlementSummary.paid)}</strong></div>
                  <div className="kpi"><span>총 지출</span><strong className="money">{money(settlementSummary.expense)}</strong></div>
                  <div className="kpi"><span>미수금</span><strong className="money">{money(settlementSummary.balance)}</strong></div>
                  <div className="kpi"><span>예상 수익</span><strong className="money">{money(settlementSummary.profit)}</strong></div>
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <div><h2>예약별 정산</h2><p>선택한 기간의 판매액 · 수금액 · 지출 · 미수금 · 예상수익을 표시합니다.</p></div>
                    {hasPermission(currentMember, 'settlement_print') &&
                      <button className="primary-action" onClick={() => window.print()}>정산표 출력</button>}
                  </div>
                  {filteredSettlementRows.length === 0 ? <EmptyState>선택한 기간에 정산할 예약이 없습니다.</EmptyState> : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>예약번호</th><th>고객</th><th>출발일</th><th>판매액</th><th>수금액</th><th>지출액</th><th>미수금</th><th>예상수익</th><th>상태</th></tr></thead>
                        <tbody>
                          {filteredSettlementRows.map(r => (
                            <tr key={r.id}>
                              <td className="code">{r.reservation_code}</td>
                              <td>{r.customer_name}</td>
                              <td>{dateText(r.departure_date)}</td>
                              <td className="amount">{money(r.sale_amount)}</td>
                              <td className="amount">{money(r.paid)}</td>
                              <td className="amount">{money(r.expense)}</td>
                              <td className={`amount ${r.balance > 0 ? 'warn' : 'good'}`}>{money(r.balance)}</td>
                              <td className="amount good">{money(r.expectedProfit)}</td>
                              <td>{r.settlement_status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}

            {activePage === 'staff' && (
              <>
                <section className="kpis">
                  <div className="kpi"><span>전체 직원</span><strong>{members.length}</strong></div>
                  <div className="kpi"><span>활성 직원</span><strong>{members.filter(m => m.active).length}</strong></div>
                  <div className="kpi"><span>MANAGER</span><strong>{members.filter(m => m.role === 'manager').length}</strong></div>
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <div><h2>등록 직원</h2><p>MASTER 계정은 보호되며 일반 직원 계정만 수정할 수 있습니다.</p></div>
                  </div>

                  <div className="staff-list">
                    {members.map(member => (
                      <div className="staff-row" key={member.user_id}>
                        <div className="staff-person">
                          <div className="avatar small"><UserRound size={16}/></div>
                          <div><strong>{member.display_name || '이름 없음'}</strong><span>{member.email}</span></div>
                        </div>
                        <div className="staff-meta">
                          <span className={`role ${member.role}`}>{roleLabel[member.role] || member.role}</span>
                          <span className={member.active ? 'status on' : 'status off'}>{member.active ? '활성' : '비활성'}</span>
                          <button onClick={() => openEdit(member)} disabled={member.role === 'master'}>
                            {member.role === 'master' ? '보호됨' : '정보 수정'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}


        {reservationModal && reservationForm && (
          <div className="modal-backdrop">
            <div className="modal reservation-modal">
              <div className="modal-head sticky-head">
                <div>
                  <h2>
                    {reservationModal === 'create' ? '예약 등록' :
                     reservationModal === 'edit' ? '예약 수정' : '예약 상세'}
                  </h2>
                  <p>{reservationForm.reservation_code}</p>
                </div>
                <button className="icon-btn" onClick={() => setReservationModal(null)}><X size={20}/></button>
              </div>

              <div className="form-section">
                <h3>기본 예약정보</h3>
                <div className="form-grid three">
                  <label>예약번호<input disabled={reservationModal==='view'} value={reservationForm.reservation_code || ''} onChange={e=>setReservationForm({...reservationForm,reservation_code:e.target.value})}/></label>
                  <label>상품구분
                    <select disabled={reservationModal==='view'} value={reservationForm.product_type || 'honeymoon'} onChange={e=>setReservationForm({...reservationForm,product_type:e.target.value})}>
                      <option value="honeymoon">허니문</option><option value="package">패키지</option><option value="air">항공</option><option value="group">단체</option>
                    </select>
                  </label>
                  <label>예약경로<input disabled={reservationModal==='view'} placeholder="예: 예식장 / 전화 / 소개" value={reservationForm.reservation_channel || ''} onChange={e=>setReservationForm({...reservationForm,reservation_channel:e.target.value})}/></label>
                  <label className="span2">상품명<input disabled={reservationModal==='view'} value={reservationForm.title || ''} onChange={e=>setReservationForm({...reservationForm,title:e.target.value})}/></label>
                  <label>지역<input disabled={reservationModal==='view'} value={reservationForm.destination || ''} onChange={e=>setReservationForm({...reservationForm,destination:e.target.value})}/></label>
                  <label>고객명<input disabled={reservationModal==='view'} value={reservationForm.customer_name || ''} onChange={e=>setReservationForm({...reservationForm,customer_name:e.target.value})}/></label>
                  <label>대표 연락처<input disabled={reservationModal==='view'} value={reservationForm.customer_phone || ''} onChange={e=>setReservationForm({...reservationForm,customer_phone:e.target.value})}/></label>
                  <label>인원<input disabled={reservationModal==='view'} type="number" min="1" value={reservationForm.traveler_count || 1} onChange={e=>setReservationForm({...reservationForm,traveler_count:e.target.value})}/></label>
                  <label>신랑 연락처<input disabled={reservationModal==='view'} value={reservationForm.groom_phone || ''} onChange={e=>setReservationForm({...reservationForm,groom_phone:e.target.value})}/></label>
                  <label>신부 연락처<input disabled={reservationModal==='view'} value={reservationForm.bride_phone || ''} onChange={e=>setReservationForm({...reservationForm,bride_phone:e.target.value})}/></label>
                  <label>담당자<input disabled={reservationModal==='view'} value={reservationForm.manager_name || ''} onChange={e=>setReservationForm({...reservationForm,manager_name:e.target.value})}/></label>
                  <label>거래처/랜드사<input disabled={reservationModal==='view'} value={reservationForm.partner_name || ''} onChange={e=>setReservationForm({...reservationForm,partner_name:e.target.value})}/></label>
                  <label>계약일<input disabled={reservationModal==='view'} type="date" value={reservationForm.contract_date || ''} onChange={e=>setReservationForm({...reservationForm,contract_date:e.target.value})}/></label>
                </div>
              </div>

              <div className="form-section">
                <h3>여행 · 항공 · 금액</h3>
                <div className="form-grid three">
                  <label>출발일<input disabled={reservationModal==='view'} type="date" value={reservationForm.departure_date || ''} onChange={e=>setReservationForm({...reservationForm,departure_date:e.target.value})}/></label>
                  <label>귀국일<input disabled={reservationModal==='view'} type="date" value={reservationForm.return_date || ''} onChange={e=>setReservationForm({...reservationForm,return_date:e.target.value})}/></label>
                  <label>판매액<input disabled={reservationModal==='view'} type="number" min="0" value={reservationForm.sale_amount || 0} onChange={e=>setReservationForm({...reservationForm,sale_amount:e.target.value})}/></label>
                  <label>항공사<input disabled={reservationModal==='view'} value={reservationForm.airline || ''} onChange={e=>setReservationForm({...reservationForm,airline:e.target.value})}/></label>
                  <label>PNR<input disabled={reservationModal==='view'} value={reservationForm.air_pnr || ''} onChange={e=>setReservationForm({...reservationForm,air_pnr:e.target.value})}/></label>
                  <label>발권기한<input disabled={reservationModal==='view'} type="date" value={reservationForm.ticketing_deadline || ''} onChange={e=>setReservationForm({...reservationForm,ticketing_deadline:e.target.value})}/></label>
                  <label>항공권 금액<input disabled={reservationModal==='view'} type="number" min="0" value={reservationForm.air_ticket_amount || 0} onChange={e=>setReservationForm({...reservationForm,air_ticket_amount:e.target.value})}/></label>
                  <label>AIR VI 금액<input disabled={reservationModal==='view'} type="number" min="0" value={reservationForm.air_vi_amount || 0} onChange={e=>setReservationForm({...reservationForm,air_vi_amount:e.target.value})}/></label>
                  <label>잔금일<input disabled={reservationModal==='view'} type="date" value={reservationForm.balance_due_date || ''} onChange={e=>setReservationForm({...reservationForm,balance_due_date:e.target.value})}/></label>
                  <label>무료취소 마감<input disabled={reservationModal==='view'} type="date" value={reservationForm.free_cancel_deadline || ''} onChange={e=>setReservationForm({...reservationForm,free_cancel_deadline:e.target.value})}/></label>
                  <label>신랑 여권만료<input disabled={reservationModal==='view'} type="date" value={reservationForm.groom_passport_expiry || ''} onChange={e=>setReservationForm({...reservationForm,groom_passport_expiry:e.target.value})}/></label>
                  <label>신부 여권만료<input disabled={reservationModal==='view'} type="date" value={reservationForm.bride_passport_expiry || ''} onChange={e=>setReservationForm({...reservationForm,bride_passport_expiry:e.target.value})}/></label>
                </div>
              </div>

              <div className="form-section">
                <h3>상태 · 정산 · 거래처 송금</h3>
                <div className="form-grid three">
                  <label>예약상태
                    <select disabled={reservationModal==='view'} value={reservationForm.status || 'confirmed'} onChange={e=>setReservationForm({...reservationForm,status:e.target.value})}>
                      <option value="inquiry">문의</option><option value="confirmed">확정</option><option value="ticketed">발권완료</option><option value="departed">출발</option><option value="completed">행사완료</option><option value="cancelled">취소</option>
                    </select>
                  </label>
                  <label>정산상태
                    <select disabled={reservationModal==='view'} value={reservationForm.settlement_status || 'unsettled'} onChange={e=>setReservationForm({...reservationForm,settlement_status:e.target.value})}>
                      <option value="unsettled">미정산</option><option value="provisional">가정산</option><option value="confirmed">정산확정</option><option value="closed">마감</option>
                    </select>
                  </label>
                  <label>송금기한<input disabled={reservationModal==='view'} type="date" value={reservationForm.partner_remittance_deadline || ''} onChange={e=>setReservationForm({...reservationForm,partner_remittance_deadline:e.target.value})}/></label>
                  <label>송금일<input disabled={reservationModal==='view'} type="date" value={reservationForm.partner_remittance_date || ''} onChange={e=>setReservationForm({...reservationForm,partner_remittance_date:e.target.value})}/></label>
                  <label>송금액<input disabled={reservationModal==='view'} type="number" min="0" value={reservationForm.partner_remittance_amount || 0} onChange={e=>setReservationForm({...reservationForm,partner_remittance_amount:e.target.value})}/></label>
                  <label>설명회 일정<input disabled={reservationModal==='view'} type="datetime-local" value={reservationForm.briefing_at || ''} onChange={e=>setReservationForm({...reservationForm,briefing_at:e.target.value})}/></label>
                  <label className="span3">송금 메모<textarea disabled={reservationModal==='view'} rows="2" value={reservationForm.partner_remittance_note || ''} onChange={e=>setReservationForm({...reservationForm,partner_remittance_note:e.target.value})}/></label>
                </div>
              </div>

              <div className="form-section">
                <h3>출발 전 업무 체크리스트</h3>
                <div className="check-grid">
                  {[
                    ['contract_written','계약서 작성'],
                    ['groom_passport_checked','신랑 여권 확인'],
                    ['bride_passport_checked','신부 여권 확인'],
                    ['supplier_confirmation_received','랜드사/공급처 확정서'],
                    ['ticketed','항공 발권 완료'],
                    ['balance_notice_done','잔금 안내'],
                    ['final_check_done','파이널 체크'],
                    ['insurance_done','여행자보험'],
                    ['gift_done','사은품 준비'],
                    ['briefing_notice_done','설명회 안내'],
                    ['travel_docs_delivered','여행서류 전달'],
                    ['honeymoon_benefit_requested','허니문 베네핏 요청'],
                    ['partner_remittance_done','거래처 송금 완료'],
                  ].map(([key,label])=>(
                    <label className="check-card" key={key}>
                      <input disabled={reservationModal==='view'} type="checkbox" checked={!!reservationForm[key]}
                        onChange={e=>setReservationForm({...reservationForm,[key]:e.target.checked})}/>
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <h3>메모</h3>
                <textarea className="memo-area" disabled={reservationModal==='view'} rows="4" value={reservationForm.memo || ''} onChange={e=>setReservationForm({...reservationForm,memo:e.target.value})}/>
              </div>

              {reservationError && <div className="login-error">{reservationError}</div>}

              <div className="modal-actions sticky-actions">
                <button className="secondary" onClick={() => setReservationModal(null)}>닫기</button>
                {reservationModal === 'view' && hasPermission(currentMember,'reservation_edit') &&
                  <button className="primary" onClick={()=>openReservationEdit(reservationForm)}><Pencil size={16}/> 수정</button>}
                {reservationModal !== 'view' &&
                  <button className="primary" onClick={saveReservation} disabled={reservationSaving}>
                    <Save size={16}/>{reservationSaving ? '저장 중...' : '예약 저장'}
                  </button>}
              </div>
            </div>
          </div>
        )}

        {selected && form && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-head">
                <div><h2>직원 정보 수정</h2><p>{selected.email}</p></div>
                <button className="icon-btn" onClick={() => setSelected(null)}><X size={20}/></button>
              </div>

              <label>이름
                <input value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})}/>
              </label>

              <label>역할
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                  <option value="manager">MANAGER</option>
                  <option value="staff">STAFF</option>
                  <option value="viewer">VIEWER</option>
                </select>
              </label>

              <label className="toggle-line">
                <span>계정 활성</span>
                <input type="checkbox" checked={form.active}
                  onChange={e => setForm({...form, active: e.target.checked})}/>
              </label>

              <div className="permissions">
                <h3>접근 권한</h3>
                <div className="permission-grid">
                  {Object.entries(permissionLabels).map(([key, label]) => (
                    <label className="check" key={key}>
                      <input type="checkbox" checked={!!form.permissions[key]}
                        onChange={e => setForm({...form, permissions:{...form.permissions,[key]:e.target.checked}})}/>
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {message && <div className="message">{message}</div>}
              <div className="modal-actions">
                <button className="secondary" onClick={() => setSelected(null)}>취소</button>
                <button className="primary" onClick={saveMember}><Save size={16}/> 변경사항 저장</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
