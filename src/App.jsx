
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  LayoutDashboard, CalendarDays, Plane, Users, ShieldCheck, LogOut,
  Plus, RefreshCw, Save, X, ChevronLeft, ChevronRight
} from 'lucide-react'

const ORG = import.meta.env.VITE_ORGANIZATION_ID

const PERM = {
  dashboard_view:'대시보드 보기', calendar_view:'출발 캘린더 보기',
  reservation_view:'예약내역 보기', reservation_create:'예약 추가',
  reservation_edit:'예약·운영정보 수정', reservation_delete:'예약 삭제',
  payment_view:'고객입금 보기', payment_manage:'고객입금 추가·수정·삭제',
  expense_view:'거래처지출 보기', expense_manage:'거래처지출 추가·수정·삭제',
  settlement_view:'정산내역 보기', settlement_print:'정산내역 인쇄',
  air_vi_view:'항공 VI 보기', air_vi_manage:'항공 VI 입력·수정',
  staff_manage:'직원 추가·권한 관리', ops_checklist_manage:'출발 전 체크 관리'
}
const defaultPerms = Object.fromEntries(Object.keys(PERM).map(k=>[k,false]))

NAV = [
  ['dashboard','▦ 통합 대시보드','dashboard_view'],
  ['calendar','▣ 출발 캘린더','calendar_view'],
  ['honeymoon','허니문','reservation_view'],
  ['package','해외패키지','reservation_view'],
  ['air','해외항공권','reservation_view'],
  ['group','국내·외 단체','reservation_view'],
  ['airvi','✈ 2026년 항공 발권 VI','air_vi_view'],
  ['staff','⚙ 직원·권한 관리','staff_manage'],
]

TYPE = {honeymoon:'허니문',package:'해외패키지',air:'해외항공권',group:'국내·외 단체'}
num=v=>Number(v||0)
won=v=>`${num(v).toLocaleString('ko-KR')}원`
ymd=d=>d?String(d).slice(0,10):'-'
monthLabel=m=>`${m}월`
const methodLabel={transfer:'입금',card:'카드',cash:'현금',mixed:'혼합'}
const roleLabel={master:'마스터',manager:'관리자',staff:'직원',viewer:'조회전용'}
const has=(m,k)=>m?.role==='master'||m?.permissions?.[k]===true
const dayDiff=(from,to)=>{const a=new Date(from),b=new Date(to);if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return null;a.setHours(0,0,0,0);b.setHours(0,0,0,0);return Math.ceil((b-a)/86400000)}
const passportStatus=r=>{if(r.passport_copy_received)return {label:'수령완료',tone:'ok'};const d=dayDiff(new Date(),r.departure_date);if(d===null)return {label:'확인대기',tone:'muted'};if(d<=30)return {label:d<0?'출발완료 미확인':'D-30 미수령',tone:'danger'};return {label:`D-${d}`,tone:'wait'}}
const intermediateAirStatus=r=>{if(!r.intermediate_air_segment_exists)return {label:'해당없음',tone:'muted'};if(!r.intermediate_air_deposit_paid)return {label:'중도금 미결제',tone:'danger'};if(!r.intermediate_air_nonrefundable_notice_done)return {label:'환불불가 미안내',tone:'danger'};return {label:'안내·결제 완료',tone:'ok'}}
const fxLabel={THB:'태국 바트 (THB)',USD:'미국 달러 (USD)',EUR:'유럽 유로 (EUR)'}
const fxAdjustment=r=>Math.round((num(r?.balance_exchange_rate)-num(r?.contract_exchange_rate))*num(r?.fx_foreign_amount_per_person)*Math.max(1,num(r?.traveler_count)))
const REMIT_STAGE={application:'신청금',interim:'중도금',balance:'잔금',additional:'추가송금'}
const remittancePaid=e=>e?.status==='paid'||!!e?.paid_date

async function syncReservationToGoogleSheets(action,reservationId){
  if(!reservationId)return
  const {error}=await supabase.functions.invoke('sync-reservation-to-google-sheets',{body:{action,reservationId}})
  if(error){
    console.error('Google Sheets reservation sync failed',error)
    alert('예약은 저장되었지만 Google Sheets 동기화에 실패했습니다. 잠시 후 다시 저장하거나 관리자에게 문의해 주세요.')
  }
}

function Login({passwordRecovery=false,onRecoveryComplete,notice=''}){
  const [screen,setScreen]=useState('login')
  const [signupName,setSignupName]=useState('')
  const [signupPassword,setSignupPassword]=useState('')
  const [signupPasswordConfirm,setSignupPasswordConfirm]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [newPassword,setNewPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState(notice)
  const [resetCooldown,setResetCooldown]=useState(0)
  const visibleMessage=message||notice
  const resetWaitLabel=resetCooldown>=60?`${Math.ceil(resetCooldown/60)}분`:`${resetCooldown}초`
  useEffect(()=>{
    if(resetCooldown<=0)return
    const timer=window.setInterval(()=>setResetCooldown(seconds=>Math.max(0,seconds-1)),1000)
    return ()=>window.clearInterval(timer)
  },[resetCooldown])
  async function submit(e){
    e.preventDefault(); setError('')
    const {error}=await supabase.auth.signInWithPassword({email,password})
    if(error)setError('이메일 또는 비밀번호를 확인해 주세요.')
  }
  async function sendPasswordReset(){
    setError('');setMessage('')
    if(!email.trim())return setError('비밀번호 재설정 메일을 받을 이메일을 입력해 주세요.')
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin})
    if(error){
      const seconds=Number(error.message?.match(/(\d+)\s*seconds?/i)?.[1]||0)
      if(seconds>0){setResetCooldown(seconds);return setError(`보안을 위해 비밀번호 재설정 메일은 ${seconds}초 후에 다시 요청할 수 있습니다.`)}
      const detail=String(error.message||'').toLowerCase()
      const isRateLimited=error.status===429||/rate limit|too many|security purposes|email.*limit/.test(detail)
      if(isRateLimited){setResetCooldown(3600);return setError('재설정 메일 요청이 일시적으로 제한되었습니다. 기본 메일 서비스의 발송 한도 때문에 약 1시간 후 다시 시도해 주세요.')}
      if(/not authorized|unauthorized.*email/.test(detail))return setError('현재 이메일 발송 서비스에서는 이 주소로 메일을 보낼 수 없습니다. 마스터 관리자에게 이메일 발송 설정을 확인해 달라고 요청해 주세요.')
      return setError('재설정 메일 발송 서비스가 일시적으로 응답하지 않습니다. 10분 후 다시 시도해 주세요. 계속되면 마스터 관리자에게 문의해 주세요.')
    }
    setResetCooldown(60)
    setMessage('비밀번호 재설정 메일을 발송했습니다. 이메일을 확인해 주세요.')
  }
  async function updatePassword(e){
    e.preventDefault();setError('');setMessage('')
    if(newPassword.length<8)return setError('새 비밀번호는 8자 이상으로 입력해 주세요.')
    if(newPassword!==confirmPassword)return setError('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.')
    const {error}=await supabase.auth.updateUser({password:newPassword})
    if(error)return setError(error.message)
    await supabase.auth.signOut()
    onRecoveryComplete?.('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.')
  }
  async function requestSignup(e){
    e.preventDefault();setError('');setMessage('')
    if(!signupName.trim())return setError('가입 요청자 이름을 입력해 주세요.')
    const {error}=await supabase.from('ops_signup_requests').insert({organization_id:ORG,full_name:signupName.trim(),email:email.trim().toLowerCase()})
    if(error){console.error('signup request failed',error);return setError('가입 요청을 접수하지 못했습니다. 잠시 후 다시 시도하거나 마스터 관리자에게 문의해 주세요.')}
    setMessage('가입 요청을 접수했습니다. 마스터 관리자 승인 후 가입할 수 있습니다. 승인 안내는 관리자에게 직접 확인해 주세요.')
    setScreen('login')
  }
  async function createApprovedAccount(e){
    e.preventDefault();setError('');setMessage('')
    if(signupPassword.length<8)return setError('비밀번호는 8자 이상으로 입력해 주세요.')
    if(signupPassword!==signupPasswordConfirm)return setError('비밀번호와 비밀번호 확인이 일치하지 않습니다.')
    const {error}=await supabase.auth.signUp({email:email.trim(),password:signupPassword,options:{emailRedirectTo:window.location.origin}})
    if(error)return setError('계정을 만들지 못했습니다. 승인된 이메일인지 확인하거나 마스터 관리자에게 문의해 주세요.')
    setMessage('계정 생성을 요청했습니다. 이메일 확인이 필요한 설정이면 수신 메일을 완료한 뒤 로그인해 주세요. 승인된 사전 등록 이메일만 서비스에 접근할 수 있습니다.')
    setSignupPassword('');setSignupPasswordConfirm('');setScreen('login')
  }
  if(passwordRecovery)return <div className="login"><form onSubmit={updatePassword}>
    <h1>새 비밀번호 설정</h1><p>안전한 새 비밀번호를 입력해 주세요.</p>
    <input placeholder="새 비밀번호 (8자 이상)" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" required/>
    <input placeholder="새 비밀번호 확인" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" required/>
    {error&&<div className="error">{error}</div>}
    <button>비밀번호 변경</button>
  </form></div>
  if(screen==='signup')return <div className="login"><form onSubmit={requestSignup}>
    <h1>회원가입 요청</h1><p>승인 전에는 계정이 생성되지 않습니다.</p>
    <input placeholder="이름" value={signupName} onChange={e=>setSignupName(e.target.value)} autoComplete="name" required/>
    <input placeholder="이메일" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/>
    {error&&<div className="error">{error}</div>}
    <button>가입 요청하기</button>
    <button type="button" className="passwordResetButton" onClick={()=>{setError('');setScreen('login')}}>로그인으로 돌아가기</button>
  </form></div>
  if(screen==='createAccount')return <div className="login"><form onSubmit={createApprovedAccount}>
    <h1>승인 후 계정 만들기</h1><p>관리자에게 승인 안내를 받은 이메일로 계정을 만드세요.</p>
    <input placeholder="이메일" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/>
    <input placeholder="비밀번호 (8자 이상)" type="password" value={signupPassword} onChange={e=>setSignupPassword(e.target.value)} autoComplete="new-password" required/>
    <input placeholder="비밀번호 확인" type="password" value={signupPasswordConfirm} onChange={e=>setSignupPasswordConfirm(e.target.value)} autoComplete="new-password" required/>
    {error&&<div className="error">{error}</div>}
    <button>계정 만들기</button>
    <button type="button" className="passwordResetButton" onClick={()=>{setError('');setScreen('login')}}>로그인으로 돌아가기</button>
  </form></div>
  return <div className="login"><form onSubmit={submit}>
    <h1>아일항공여행사</h1><p>통합 예약관리</p>
    <input placeholder="이메일" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
    <input placeholder="비밀번호" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>
    {error&&<div className="error">{error}</div>}
    {visibleMessage&&<div className="loginNotice">{visibleMessage}</div>}
    <button>로그인</button>
    <button type="button" className="passwordResetButton" disabled={resetCooldown>0} onClick={sendPasswordReset}>{resetCooldown>0?`재설정 메일 재요청 (${resetWaitLabel} 후)`:"비밀번호를 잊으셨나요?"}</button>
    {resetCooldown>0&&<p className="resetCooldownHint">보안을 위해 재설정 메일은 잠시 후 다시 요청할 수 있습니다. 메일을 이미 요청했다면 받은편지함과 스팸함도 확인해 주세요.</p>}
    <button type="button" className="signupRequestButton" onClick={()=>{setError('');setMessage('');setScreen('signup')}}>계정 확인 · 회원가입 요청</button>
    <button type="button" className="signupRequestButton" onClick={()=>{setError('');setMessage('');setScreen('createAccount')}}>승인 후 계정 만들기</button>
  </form></div>
}

export default function App(){
  const [session,setSession]=useState(null)
  const [passwordRecovery,setPasswordRecovery]=useState(false)
  const [authNotice,setAuthNotice]=useState('')
  const [member,setMember]=useState(null)
  const [page,setPage]=useState('dashboard')
  const [rows,setRows]=useState([])
  const [payments,setPayments]=useState([])
  const [expenses,setExpenses]=useState([])
  const [members,setMembers]=useState([])
  const [signupRequests,setSignupRequests]=useState([])
  const [landContracts,setLandContracts]=useState([])
  const [remitTemplates,setRemitTemplates]=useState([])
  const [remitTemplateItems,setRemitTemplateItems]=useState([])
  const [reservationChanges,setReservationChanges]=useState([])
  const [landAnomalies,setLandAnomalies]=useState([])
  const [landWorkflow,setLandWorkflow]=useState([])
  const [landWorkQueue,setLandWorkQueue]=useState([])
  const [staffWorkSummary,setStaffWorkSummary]=useState([])
  const [staffWorkFilter,setStaffWorkFilter]=useState('')
  const [landWorkHistory,setLandWorkHistory]=useState([])
  const [todayWorkCenter,setTodayWorkCenter]=useState([])
  const [consultationModal,setConsultationModal]=useState(null)
  const [travelers,setTravelers]=useState([])
  const [airBookings,setAirBookings]=useState([])
  const [hotelBookings,setHotelBookings]=useState([])
  const [landBookings,setLandBookings]=useState([])
  const [documents,setDocuments]=useState([])
  const [detailReservation,setDetailReservation]=useState(null)
  const [detailTab,setDetailTab]=useState('overview')
  const [todayWorkFilter,setTodayWorkFilter]=useState('urgent')
  const [taskCompleteModal,setTaskCompleteModal]=useState(null)
  const [workHistoryReservation,setWorkHistoryReservation]=useState(null)
  const [vi,setVi]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [year,setYear]=useState(2026)
  const [period,setPeriod]=useState('year')
  const [periodValue,setPeriodValue]=useState('all')
  const [statsMode,setStatsMode]=useState('reservation')
  const [calendarDate,setCalendarDate]=useState(new Date(2026,7,1))
  const [invite,setInvite]=useState({display_name:'',email:'',role:'staff',permissions:{...defaultPerms}})
  const [modal,setModal]=useState(null)
  const [remitModal,setRemitModal]=useState(null)
  const [contractModal,setContractModal]=useState(null)
  const [templateModal,setTemplateModal]=useState(null)
  const [templateManagerOpen,setTemplateManagerOpen]=useState(false)
  const [historyReservation,setHistoryReservation]=useState(null)
  const [taskAssignModal,setTaskAssignModal]=useState(null)
  const [paymentModal,setPaymentModal]=useState(null)
  const [entityModal,setEntityModal]=useState(null)
  const [qualityModal,setQualityModal]=useState(null)
  const [qualityExpenseModal,setQualityExpenseModal]=useState(null)
  const [profitReportOpen,setProfitReportOpen]=useState(false)
  const modalSnapshots=useRef({})

  const editableModalMap={
    reservation:modal, payment:paymentModal, entity:entityModal, remittance:remitModal,
    contract:contractModal, template:templateModal, assignment:taskAssignModal, completion:taskCompleteModal, qualityExpense:qualityExpenseModal
  }
  const modalSetterMap={
    reservation:setModal, payment:setPaymentModal, entity:setEntityModal, remittance:setRemitModal,
    contract:setContractModal, template:setTemplateModal, assignment:setTaskAssignModal, completion:setTaskCompleteModal, qualityExpense:setQualityExpenseModal
  }
  const modalComparable=value=>JSON.stringify(value??null)
  function isModalDirty(key,value){
    const initial=modalSnapshots.current[key]
    return !!value&&initial!==undefined&&initial!==modalComparable(value)
  }
  function closeEditableModal(key,value){
    if(isModalDirty(key,value)&&!window.confirm('저장하지 않은 변경사항이 있습니다. 저장하지 않고 닫으시겠습니까?'))return false
    delete modalSnapshots.current[key]
    modalSetterMap[key]?.(null)
    return true
  }

  useEffect(()=>{
    Object.entries(editableModalMap).forEach(([key,value])=>{
      if(value&&modalSnapshots.current[key]===undefined)modalSnapshots.current[key]=modalComparable(value)
      if(!value)delete modalSnapshots.current[key]
    })
  },[modal,paymentModal,entityModal,remitModal,contractModal,templateModal,taskAssignModal,taskCompleteModal,qualityExpenseModal])

  useEffect(()=>{
    const hasDirty=Object.entries(editableModalMap).some(([key,value])=>isModalDirty(key,value))
    if(!hasDirty)return
    const beforeUnload=e=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',beforeUnload)
    return ()=>window.removeEventListener('beforeunload',beforeUnload)
  },[modal,paymentModal,entityModal,remitModal,contractModal,templateModal,taskAssignModal,taskCompleteModal,qualityExpenseModal])

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
    const {data}=supabase.auth.onAuthStateChange((event,s)=>{
      if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true)
      setSession(s)
    })
    return ()=>data.subscription.unsubscribe()
  },[])
  useEffect(()=>{ if(session?.user?.id) loadMember() },[session?.user?.id])
  useEffect(()=>{ if(member) loadAll() },[member?.user_id])
  useEffect(()=>{ if(member&&page==='staff'&&has(member,'staff_manage'))loadSignupRequests() },[member?.user_id,page])

  async function loadMember(){
    const {data,error}=await supabase.from('ops_members').select('*')
      .eq('organization_id',ORG).eq('user_id',session.user.id).maybeSingle()
    if(error||!data){
      await supabase.auth.signOut()
      setSession(null)
      setAuthNotice('승인된 운영 계정을 확인할 수 없습니다. 마스터 관리자에게 문의해 주세요.')
      return
    }
    setMember(data)
  }
  async function loadAll(){
    setLoading(true);setError('')
    const [r,p,e,m,c,t,ti,ch,a,w,q,sw,wh,tw,tr,ab,hb,lb,doc,v]=await Promise.all([
      supabase.from('ops_dashboard_reservations').select('*').eq('organization_id',ORG).order('departure_date',{ascending:true}),
      supabase.from('ops_payments').select('*').eq('organization_id',ORG),
      supabase.from('ops_expenses').select('*').eq('organization_id',ORG),
      supabase.from('ops_members').select('*').eq('organization_id',ORG).order('created_at'),
      supabase.from('ops_land_contracts').select('*').eq('organization_id',ORG).order('created_at'),
      supabase.from('ops_land_remittance_templates').select('*').eq('organization_id',ORG).order('vendor_name').order('template_name'),
      supabase.from('ops_land_remittance_template_items').select('*').order('sort_order'),
      supabase.from('ops_reservation_changes').select('*').eq('organization_id',ORG).order('changed_at',{ascending:false}).limit(1500),
      supabase.from('ops_land_remittance_anomalies').select('*').eq('organization_id',ORG).order('departure_date',{ascending:true}),
      supabase.from('ops_land_workflow_status').select('*').eq('organization_id',ORG).order('departure_date',{ascending:true}),
      supabase.from('ops_land_work_queue').select('*').eq('organization_id',ORG).order('departure_date',{ascending:true}),
      supabase.from('ops_staff_land_work_summary').select('*').eq('organization_id',ORG).order('display_name',{ascending:true}),
      supabase.from('ops_land_work_history').select('*').eq('organization_id',ORG).order('created_at',{ascending:false}).limit(1500),
      supabase.from('ops_today_work_center').select('*').eq('organization_id',ORG).order('priority_rank',{ascending:true}).order('due_date',{ascending:true}),
      supabase.from('ops_travelers').select('*').eq('organization_id',ORG).order('is_primary',{ascending:false}).order('created_at'),
      supabase.from('ops_air_bookings').select('*').eq('organization_id',ORG).order('departure_at'),
      supabase.from('ops_hotel_bookings').select('*').eq('organization_id',ORG).order('check_in'),
      supabase.from('ops_land_bookings').select('*').eq('organization_id',ORG).order('request_date'),
      supabase.from('ops_documents').select('*').eq('organization_id',ORG).order('created_at'),
      supabase.from('ops_air_vi_monthly').select('*').eq('organization_id',ORG).order('year').order('month')
    ])
    const er=r.error||p.error||e.error||m.error||c.error||t.error||ti.error||ch.error||a.error||w.error||q.error||sw.error||wh.error||tw.error||tr.error||ab.error||hb.error||lb.error||doc.error||v.error
    if(er)setError(er.message)
    setRows(r.data||[]);setPayments(p.data||[]);setExpenses(e.data||[]);setMembers(m.data||[]);setLandContracts(c.data||[]);setRemitTemplates(t.data||[]);setRemitTemplateItems(ti.data||[]);setReservationChanges(ch.data||[]);setLandAnomalies(a.data||[]);setLandWorkflow(w.data||[]);setLandWorkQueue(q.data||[]);setStaffWorkSummary(sw.data||[]);setLandWorkHistory(wh.data||[]);setTodayWorkCenter(tw.data||[]);setTravelers(tr.data||[]);setAirBookings(ab.data||[]);setHotelBookings(hb.data||[]);setLandBookings(lb.data||[]);setDocuments(doc.data||[]);setVi(v.data||[])
    setLoading(false)
  }
  async function loadSignupRequests(){
    const {data,error}=await supabase.from('ops_signup_requests').select('*').eq('organization_id',ORG).order('requested_at',{ascending:false})
    if(error){console.error('signup request load failed',error);return}
    setSignupRequests(data||[])
  }

  const payMap=useMemo(()=>Object.fromEntries(rows.map(r=>[r.id,num(r.paid_amount)])),[rows])
  const expMap=useMemo(()=>Object.fromEntries(rows.map(r=>[r.id,num(r.expense_amount)])),[rows])

  function matchesPeriodDate(value){
    if(!value)return false
    const d=new Date(value)
    if(Number.isNaN(d.getTime())||d.getFullYear()!==Number(year))return false
    const m=d.getMonth()+1
    if(period==='year')return true
    if(period==='quarter')return Math.ceil(m/3)===Number(periodValue)
    if(period==='half')return (m<=6?1:2)===Number(periodValue)
    if(period==='month')return m===Number(periodValue)
    return true
  }

  function inPeriod(r){
    return matchesPeriodDate(r.departure_date)
  }

  const statsScopeRows=useMemo(()=>{
    if(['honeymoon','package','air','group'].includes(page)) return rows.filter(r=>r.product_type===page)
    return rows
  },[rows,page])

  const periodRows=statsScopeRows.filter(inPeriod)
  const periodReservationIds=useMemo(()=>new Set(periodRows.map(r=>r.id)),[periodRows])

  const reservationStats=useMemo(()=>{
    const sale=periodRows.reduce((a,r)=>a+num(r.sale_amount),0)
    const paid=periodRows.reduce((a,r)=>a+num(payMap[r.id]),0)
    const expense=periodRows.reduce((a,r)=>a+num(expMap[r.id]),0)
    return {
      count:periodRows.length,
      people:periodRows.reduce((a,r)=>a+num(r.traveler_count),0),
      sale,paid,expense,profit:sale-expense,balance:sale-paid
    }
  },[periodRows,payMap,expMap])

  const accountingStats=useMemo(()=>{
    const periodPayments=payments.filter(p=>periodReservationIds.has(p.reservation_id)&&matchesPeriodDate(p.payment_date))
    const periodExpenses=expenses.filter(e=>periodReservationIds.has(e.reservation_id)&&matchesPeriodDate(e.paid_date || e.due_date))
    const paid=periodPayments.reduce((a,p)=>a+num(p.amount),0)
    const expense=periodExpenses.reduce((a,e)=>a+num(e.amount_krw),0)
    return {
      paid, expense,
      paymentCount:periodPayments.length,
      expenseCount:periodExpenses.length
    }
  },[payments,expenses,year,period,periodValue,periodReservationIds])

  const stats=statsMode==='reservation' ? reservationStats : {
    ...reservationStats,
    paid:accountingStats.paid,
    expense:accountingStats.expense,
    profit:reservationStats.sale-accountingStats.expense,
    balance:reservationStats.sale-accountingStats.paid
  }

  const overpaymentRows=useMemo(()=>periodRows
    .map(r=>({...r,paid:num(payMap[r.id]),overpaid:num(payMap[r.id])-num(r.sale_amount)}))
    .filter(r=>r.overpaid>0)
    .sort((a,b)=>b.overpaid-a.overpaid),[periodRows,payMap])

  const zeroSalePaidRows=useMemo(()=>periodRows
    .map(r=>({...r,paid:num(payMap[r.id])}))
    .filter(r=>num(r.sale_amount)===0 && r.paid>0),[periodRows,payMap])

  const uncategorizedExpenses=useMemo(()=>{
    const ids=new Set(periodRows.map(r=>r.id))
    return expenses.filter(e=>ids.has(e.reservation_id) && e.expense_type==='other')
  },[expenses,periodRows])

  const uncategorizedTotal=useMemo(()=>uncategorizedExpenses.reduce((a,e)=>a+num(e.amount_krw),0),[uncategorizedExpenses])

  const uncategorizedReservationRows=useMemo(()=>{
    const sums={}
    uncategorizedExpenses.forEach(e=>{sums[e.reservation_id]=(sums[e.reservation_id]||0)+num(e.amount_krw)})
    return Object.entries(sums).map(([id,amount])=>{const r=rows.find(x=>x.id===id);return r?{...r,uncategorized_amount:amount}:null}).filter(Boolean).sort((a,b)=>b.uncategorized_amount-a.uncategorized_amount)
  },[uncategorizedExpenses,rows])

  function openQualityModal(type){
    if(type==='zero_sale_paid')setQualityModal({type,title:'매출 0원인데 입금 존재',tab:'payments',items:zeroSalePaidRows})
    if(type==='overpayment')setQualityModal({type,title:'매출보다 입금이 많은 예약',tab:'payments',items:overpaymentRows})
    if(type==='uncategorized')setQualityModal({type,title:'기타·미분류 원가',tab:'expenses',items:uncategorizedReservationRows})
  }

  function openQualityReservation(r,tab){
    setQualityModal(null)
    openDetail(r,tab||'overview')
  }

  function openQualityReservationEdit(r){
    setQualityModal(null)
    openEdit(r)
  }

  function openExpenseReclass(r){
    if(!has(member,'expense_manage'))return
    const items=expenses.filter(e=>e.reservation_id===r.id && e.expense_type==='other').map(e=>({...e,new_expense_type:'other'}))
    setQualityModal(null)
    setQualityExpenseModal({reservation:r,items})
  }

  async function saveExpenseReclass(){
    if(!qualityExpenseModal||!has(member,'expense_manage'))return
    const changed=qualityExpenseModal.items.filter(e=>e.new_expense_type && e.new_expense_type!==e.expense_type)
    if(changed.length===0)return alert('재분류할 항목을 선택해 주세요.')
    const results=await Promise.all(changed.map(e=>supabase.from('ops_expenses').update({expense_type:e.new_expense_type}).eq('organization_id',ORG).eq('id',e.id)))
    const failed=results.find(x=>x.error)
    if(failed)return alert(failed.error.message)
    delete modalSnapshots.current.qualityExpense
    setQualityExpenseModal(null)
    await loadAll()
    alert(`${changed.length}건을 재분류했습니다.`)
  }

  const profitReport=useMemo(()=>{
    const rr=periodRows
    const ids=new Set(rr.map(r=>r.id))
    const finalSale=rr.reduce((a,r)=>a+num(r.final_sale_amount||r.sale_amount),0)
    const contractSale=rr.reduce((a,r)=>a+num(r.sale_amount),0)
    const fxAdjustment=rr.reduce((a,r)=>a+num(r.exchange_adjustment_amount),0)
    const paid=rr.reduce((a,r)=>a+num(payMap[r.id]),0)
    const expense=rr.reduce((a,r)=>a+num(expMap[r.id]),0)
    const profit=finalSale-expense
    const scopedExpenses=expenses.filter(e=>ids.has(e.reservation_id))
    const airCost=scopedExpenses.filter(e=>['international_air','domestic_air'].includes(e.expense_type)).reduce((a,e)=>a+num(e.amount_krw),0)
    const hotelCost=scopedExpenses.filter(e=>e.expense_type==='hotel').reduce((a,e)=>a+num(e.amount_krw),0)
    const landCost=scopedExpenses.filter(e=>e.expense_type==='land').reduce((a,e)=>a+num(e.amount_krw),0)
    const otherCost=scopedExpenses.filter(e=>!['international_air','domestic_air','hotel','land'].includes(e.expense_type)).reduce((a,e)=>a+num(e.amount_krw),0)
    return {rows:rr,count:rr.length,people:rr.reduce((a,r)=>a+num(r.traveler_count),0),contractSale,fxAdjustment,finalSale,paid,expense,profit,balance:finalSale-paid,margin:finalSale?profit/finalSale*100:0,airCost,hotelCost,landCost,otherCost}
  },[periodRows,payMap,expMap,expenses])

  const dashboardAnalytics=useMemo(()=>{
    const rr=periodRows
    const monthMap=Array.from({length:12},(_,i)=>({month:i+1,sale:0,paid:0,profit:0,count:0}))
    rr.forEach(r=>{
      const m=Number(String(r.departure_date||'').slice(5,7))
      if(!m||!monthMap[m-1])return
      const sale=num(r.final_sale_amount||r.sale_amount)
      const paid=num(payMap[r.id])
      const expense=num(expMap[r.id])
      monthMap[m-1].sale+=sale; monthMap[m-1].paid+=paid; monthMap[m-1].profit+=sale-expense; monthMap[m-1].count+=1
    })
    const visibleMonths=monthMap.filter(x=>x.count>0 || period==='year')
    const productKeys=['honeymoon','package','air','group']
    const productMix=productKeys.map(k=>{const list=rr.filter(r=>r.product_type===k);return {key:k,label:TYPE[k],value:list.reduce((a,r)=>a+num(r.final_sale_amount||r.sale_amount),0),count:list.length}}).filter(x=>x.count>0)
    const groupTop=(keyFn)=>{
      const map=new Map()
      rr.forEach(r=>{const k=(keyFn(r)||'미지정').trim?.()||'미지정';const sale=num(r.final_sale_amount||r.sale_amount);map.set(k,(map.get(k)||0)+sale)})
      return [...map.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0,5)
    }
    const destinationTop=groupTop(r=>r.destination||r.title||'미지정')
    const managerTop=groupTop(r=>r.manager_name||'담당 미지정')
    const finalSale=rr.reduce((a,r)=>a+num(r.final_sale_amount||r.sale_amount),0)
    const paid=rr.reduce((a,r)=>a+num(payMap[r.id]),0)
    const receivable=rr.reduce((a,r)=>a+Math.max(0,num(r.final_sale_amount||r.sale_amount)-num(payMap[r.id])),0)
    const overpaid=rr.reduce((a,r)=>a+Math.max(0,num(payMap[r.id])-num(r.final_sale_amount||r.sale_amount)),0)
    return {months:visibleMonths,productMix,destinationTop,managerTop,finalSale,paid,receivable,overpaid,paymentRate:finalSale?paid/finalSale*100:0}
  },[periodRows,payMap,expMap,period,year])

  function reportScopeLabel(){return page==='dashboard'?'전체 예약':`${TYPE[page]} 예약`}
  function reportPeriodLabel(){
    if(period==='year')return `${year}년 전체`
    if(period==='quarter')return `${year}년 ${periodValue}분기`
    if(period==='half')return `${year}년 ${periodValue}반기`
    if(period==='month')return `${year}년 ${periodValue}월`
    return `${year}년`
  }
  function openProfitReport(){setProfitReportOpen(true)}
  function printProfitReport(){window.setTimeout(()=>window.print(),80)}

  const overdue=useMemo(()=>rows.filter(r=>r.partner_remittance_deadline && !r.partner_remittance_done && new Date(r.partner_remittance_deadline)<new Date()),[rows])

  function productRows(type){return rows.filter(r=>r.product_type===type&&inPeriod(r))}
  const yearOptions=useMemo(()=>[...new Set(rows.map(r=>Number(String(r.departure_date||'').slice(0,4))).filter(Boolean).concat([2026,2027]))].sort(),[rows])

  const yearly=useMemo(()=>yearOptions.map(y=>{
    const rr=rows.filter(r=>String(r.departure_date||'').startsWith(String(y)))
    const sale=rr.reduce((a,r)=>a+num(r.sale_amount),0)
    const paid=rr.reduce((a,r)=>a+num(payMap[r.id]),0)
    const expense=rr.reduce((a,r)=>a+num(expMap[r.id]),0)
    return {y,count:rr.length,people:rr.reduce((a,r)=>a+num(r.traveler_count),0),sale,paid,expense,profit:sale-expense}
  }),[rows,payMap,expMap,yearOptions])

  function changePeriod(p){
    setPeriod(p)
    if(p==='year')setPeriodValue('all')
    if(p==='quarter')setPeriodValue('1')
    if(p==='half')setPeriodValue('1')
    if(p==='month')setPeriodValue('1')
  }

  async function saveVi(){
    if(!has(member,'air_vi_manage'))return
    const payload=Array.from({length:12},(_,i)=>{
      const ex=vi.find(v=>v.year===Number(year)&&v.month===i+1)
      return {organization_id:ORG,year:Number(year),month:i+1,ticket_total:num(ex?.ticket_total),vi_amount:num(ex?.vi_amount),updated_by:session.user.id}
    })
    const {error}=await supabase.from('ops_air_vi_monthly').upsert(payload,{onConflict:'organization_id,year,month'})
    if(error)alert(error.message);else{alert('월별 내역을 저장했습니다.');loadAll()}
  }
  function updateVi(month,key,value){
    setVi(prev=>{
      const copy=[...prev]; const ix=copy.findIndex(x=>x.year===Number(year)&&x.month===month)
      if(ix>=0)copy[ix]={...copy[ix],[key]:num(value)}
      else copy.push({organization_id:ORG,year:Number(year),month,ticket_total:0,vi_amount:0,[key]:num(value)})
      return copy
    })
  }

  async function saveInvite(){
    if(!invite.display_name||!invite.email)return alert('직원 이름과 이메일을 입력해 주세요.')
    const {error}=await supabase.from('ops_staff_invites').insert({
      organization_id:ORG,display_name:invite.display_name,email:invite.email,
      role:invite.role,permissions:invite.permissions,active:true,invited_by:session.user.id
    })
    if(error)alert(error.message);else{alert('직원 사전 등록이 완료되었습니다.');setInvite({display_name:'',email:'',role:'staff',permissions:{...defaultPerms}})}
  }
  async function approveSignupRequest(request){
    if(!window.confirm(`${request.full_name} (${request.email})님의 가입 요청을 승인하시겠습니까?`))return
    const {error:inviteError}=await supabase.from('ops_staff_invites').insert({
      organization_id:ORG,display_name:request.full_name,email:request.email,
      role:'staff',permissions:{...defaultPerms,dashboard_view:true,calendar_view:true,reservation_view:true},active:true,invited_by:session.user.id
    })
    if(inviteError)return alert(inviteError.message)
    const {error}=await supabase.from('ops_signup_requests').update({status:'approved',approved_at:new Date().toISOString(),approved_by:session.user.id}).eq('id',request.id).eq('organization_id',ORG)
    if(error)return alert(error.message)
    await loadSignupRequests()
    alert('가입 요청을 승인하고 직원 사전 등록을 완료했습니다. 요청자에게 가입 가능 여부를 직접 안내해 주세요.')
  }
  async function rejectSignupRequest(request){
    if(!window.confirm(`${request.full_name}님의 가입 요청을 반려하시겠습니까?`))return
    const {error}=await supabase.from('ops_signup_requests').update({status:'rejected',rejected_at:new Date().toISOString(),rejected_by:session.user.id}).eq('id',request.id).eq('organization_id',ORG)
    if(error)return alert(error.message)
    await loadSignupRequests()
  }
  async function toggleMemberPermission(target,key){
    if(!has(member,'staff_manage'))return alert('직원 권한 관리 권한이 없습니다.')
    if(target.role==='master')return alert('마스터 권한은 이 화면에서 변경할 수 없습니다.')
    if(target.user_id===session.user.id)return alert('본인 계정의 권한은 이 화면에서 변경할 수 없습니다.')
    const permissions={...defaultPerms,...target.permissions,[key]:!target.permissions?.[key]}
    const {error}=await supabase.from('ops_members').update({permissions}).eq('organization_id',ORG).eq('user_id',target.user_id)
    if(error)return alert(error.message)
    setMembers(prev=>prev.map(item=>item.user_id===target.user_id?{...item,permissions}:item))
  }
  async function changeMasterRole(target,nextRole){
    if(member?.role!=='master')return alert('마스터 계정만 다른 마스터의 역할을 변경할 수 있습니다.')
    if(target.user_id===session.user.id)return alert('본인 마스터 계정의 역할은 변경할 수 없습니다.')
    if(target.role!=='master')return alert('마스터 계정만 역할 변경 대상으로 선택할 수 있습니다.')
    if(!['manager','staff','viewer'].includes(nextRole))return
    if(!window.confirm(`${target.display_name||target.email}님의 역할을 ${roleLabel[nextRole]}으로 변경하시겠습니까? 변경 후에는 항목별 권한을 직접 설정할 수 있습니다.`))return
    const permissions={...defaultPerms}
    const {error}=await supabase.from('ops_members').update({role:nextRole,permissions}).eq('organization_id',ORG).eq('user_id',target.user_id)
    if(error)return alert(error.message)
    setMembers(prev=>prev.map(item=>item.user_id===target.user_id?{...item,role:nextRole,permissions}:item))
    alert(`${target.display_name||target.email}님의 역할을 ${roleLabel[nextRole]}으로 변경했습니다. 아래 권한 토글에서 필요한 항목을 허용해 주세요.`)
  }

  const TODAY_WORK_LABEL={customer_balance:'고객 잔금',final_check:'최종체크',passport_copy:'여권사본',intermediate_air:'중간항공',land_work:'랜드사 업무'}
  const todayWorkSummary=useMemo(()=>({
    total:todayWorkCenter.length,
    overdue:todayWorkCenter.filter(x=>x.timing_status==='overdue').length,
    today:todayWorkCenter.filter(x=>x.timing_status==='today').length,
    due3:todayWorkCenter.filter(x=>x.timing_status==='due_3d').length,
    due7:todayWorkCenter.filter(x=>x.timing_status==='due_7d').length,
    balance:todayWorkCenter.filter(x=>x.task_type==='customer_balance').length,
    final:todayWorkCenter.filter(x=>x.task_type==='final_check').length,
    passport:todayWorkCenter.filter(x=>x.task_type==='passport_copy').length,
    land:todayWorkCenter.filter(x=>x.task_type==='land_work').length
  }),[todayWorkCenter])
  const visibleTodayWork=useMemo(()=>{
    let list=[...todayWorkCenter]
    if(todayWorkFilter==='urgent')list=list.filter(x=>['overdue','today','due_3d','due_7d'].includes(x.timing_status))
    else if(todayWorkFilter!=='all')list=list.filter(x=>x.task_type===todayWorkFilter)
    return list.sort((a,b)=>num(a.priority_rank)-num(b.priority_rank)||(String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')))||(num(a.task_type_rank)-num(b.task_type_rank)))
  },[todayWorkCenter,todayWorkFilter])
  function todayWorkTone(x){return x.timing_status==='overdue'?'danger':x.timing_status==='today'?'today':x.timing_status==='due_3d'?'warn':x.timing_status==='due_7d'?'soon':'scheduled'}
  function todayWorkTiming(x){
    if(x.timing_status==='overdue')return `지연 ${Math.abs(dayDiff(new Date(),x.due_date))}일`
    if(x.timing_status==='today')return '오늘'
    if(x.due_date){const d=dayDiff(new Date(),x.due_date);return d>=0?`D-${d}`:ymd(x.due_date)}
    return '확인필요'
  }
  const DETAIL_TABS=[['overview','개요'],['travelers','고객·여행자'],['payments','입금·환불'],['expenses','지출·송금'],['checklist','출발 체크'],['settlement','정산·손익'],['history','메모·변경이력']]
  function openDetail(r,tab='overview'){if(!r)return;setDetailReservation(r);setDetailTab(tab)}
  function reservationItems(list,id){return list.filter(x=>x.reservation_id===id)}
  function paymentNet(id){return reservationItems(payments,id).reduce((a,p)=>a+(p.payment_type==='refund'?-num(p.amount):num(p.amount)),0)}
  function expensePaidTotal(id){return reservationItems(expenses,id).filter(x=>x.status==='paid'||x.paid_date).reduce((a,x)=>a+num(x.amount_krw),0)}
  function docLabel(v){return ({contract:'계약서',voucher:'바우처',itinerary:'일정표',invoice:'청구서',passport:'여권',ticket:'항공권'})[v]||v||'문서'}
  function toLocalDateTime(v){if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
  const ENTITY_META={traveler:{table:'ops_travelers',label:'여행자'},air:{table:'ops_air_bookings',label:'항공 예약'},hotel:{table:'ops_hotel_bookings',label:'호텔 예약'},document:{table:'ops_documents',label:'문서'}}
  function openEntityModal(type,item=null){
    if(!has(member,'reservation_edit'))return alert('예약 수정 권한이 없습니다.')
    if(!detailReservation)return
    const base={type,mode:item?'edit':'create',id:item?.id||null,reservation_id:detailReservation.id}
    if(type==='traveler')setEntityModal({...base,traveler_type:item?.traveler_type||'adult',traveler_role:item?.traveler_role||'general',full_name:item?.full_name||'',english_name:item?.english_name||'',phone:item?.phone||'',birth_date:ymd(item?.birth_date)==='-'?'':ymd(item?.birth_date),gender:item?.gender||'',passport_no:item?.passport_no||'',passport_expiry:ymd(item?.passport_expiry)==='-'?'':ymd(item?.passport_expiry),passport_checked:!!item?.passport_checked,is_primary:!!item?.is_primary,note:item?.note||''})
    if(type==='air')setEntityModal({...base,segment_role:item?.segment_role||(['domestic','intermediate'].includes(item?.segment_type)?item.segment_type:'international'),airline:item?.airline||'',flight_no:item?.flight_no||'',pnr:item?.pnr||'',departure_airport:item?.departure_airport||'',arrival_airport:item?.arrival_airport||'',departure_at:toLocalDateTime(item?.departure_at),arrival_at:toLocalDateTime(item?.arrival_at),ticketing_deadline:toLocalDateTime(item?.ticketing_deadline),ticketed:!!item?.ticketed,issuer:item?.issuer||'',amount_krw:item?.amount_krw||'',status:item?.status||'confirmed',note:item?.note||''})
    if(type==='hotel')setEntityModal({...base,hotel_name:item?.hotel_name||'',room_type:item?.room_type||'',meal_plan:item?.meal_plan||'',check_in:ymd(item?.check_in)==='-'?'':ymd(item?.check_in),check_out:ymd(item?.check_out)==='-'?'':ymd(item?.check_out),rooms:item?.rooms||1,confirmation_no:item?.confirmation_no||'',supplier_name:item?.supplier_name||'',free_cancel_deadline:ymd(item?.free_cancel_deadline)==='-'?'':ymd(item?.free_cancel_deadline),amount_krw:item?.amount_krw||'',status:item?.status||'confirmed',honeymoon_benefit_requested:!!item?.honeymoon_benefit_requested,note:item?.note||''})
    if(type==='document')setEntityModal({...base,document_type:item?.document_type||'itinerary',title:item?.title||'',file_url:item?.file_url||'',delivered:!!item?.delivered,delivered_at:toLocalDateTime(item?.delivered_at),note:item?.note||''})
  }
  async function saveOperationalEntity(){
    if(!entityModal||!has(member,'reservation_edit'))return
    const m=entityModal, meta=ENTITY_META[m.type];if(!meta)return
    let payload={organization_id:ORG,reservation_id:m.reservation_id}
    if(m.type==='traveler')payload={...payload,traveler_type:m.traveler_type||null,traveler_role:m.traveler_role||'general',full_name:m.full_name||null,english_name:m.english_name||null,phone:m.phone||null,birth_date:m.birth_date||null,gender:m.gender||null,passport_no:m.passport_no||null,passport_expiry:m.passport_expiry||null,passport_checked:!!m.passport_checked,is_primary:!!m.is_primary,note:m.note||null}
    if(m.type==='air')payload={...payload,segment_role:m.segment_role||'international',segment_type:m.segment_role||'international',airline:m.airline||null,flight_no:m.flight_no||null,pnr:m.pnr||null,departure_airport:m.departure_airport||null,arrival_airport:m.arrival_airport||null,departure_at:m.departure_at?new Date(m.departure_at).toISOString():null,arrival_at:m.arrival_at?new Date(m.arrival_at).toISOString():null,ticketing_deadline:m.ticketing_deadline?new Date(m.ticketing_deadline).toISOString():null,ticketed:!!m.ticketed,ticketed_at:m.ticketed?(new Date().toISOString()):null,issuer:m.issuer||null,amount_krw:m.amount_krw===''?null:num(m.amount_krw),status:m.status||null,note:m.note||null}
    if(m.type==='hotel')payload={...payload,hotel_name:m.hotel_name||null,room_type:m.room_type||null,meal_plan:m.meal_plan||null,check_in:m.check_in||null,check_out:m.check_out||null,rooms:Math.max(1,num(m.rooms)||1),confirmation_no:m.confirmation_no||null,supplier_name:m.supplier_name||null,free_cancel_deadline:m.free_cancel_deadline||null,amount_krw:m.amount_krw===''?null:num(m.amount_krw),status:m.status||null,honeymoon_benefit_requested:!!m.honeymoon_benefit_requested,note:m.note||null}
    if(m.type==='document')payload={...payload,document_type:m.document_type||null,title:m.title||null,file_url:m.file_url||null,delivered:!!m.delivered,delivered_at:m.delivered?(m.delivered_at?new Date(m.delivered_at).toISOString():new Date().toISOString()):null,note:m.note||null,...(m.mode==='create'?{created_by:session.user.id}:{})}
    const q=m.mode==='edit'?supabase.from(meta.table).update(payload).eq('organization_id',ORG).eq('id',m.id):supabase.from(meta.table).insert(payload)
    const {error}=await q;if(error)return alert(error.message)
    setEntityModal(null);await loadAll()
  }
  async function deleteOperationalEntity(type,item){
    if(!has(member,'reservation_edit'))return alert('예약 수정 권한이 없습니다.')
    const meta=ENTITY_META[type];if(!meta||!item?.id)return
    if(!confirm(`${meta.label} 항목을 삭제하시겠습니까?`))return
    const {error}=await supabase.from(meta.table).delete().eq('organization_id',ORG).eq('id',item.id)
    if(error)return alert(error.message)
    await loadAll()
  }

async function goToTodayWork(x){
    if(['consultation_new','consultation_contacting'].includes(x.task_type)){
      const {data,error}=await supabase
        .from('ops_consultations')
        .select('*')
        .eq('organization_id',ORG)
        .eq('request_code',x.reservation_code)
        .maybeSingle()

      if(error)return alert(error.message)
      if(!data)return alert('상담 접수 정보를 찾을 수 없습니다.')

      setConsultationModal(data)
      return
    }

    const r=rows.find(v=>v.id===x.reservation_id)
    if(!r)return

    if(x.task_type==='land_work'){openDetail(r,'expenses');return}
    if(x.task_type==='customer_balance'){openDetail(r,'payments');return}
    if(['final_check','passport_copy','intermediate_air'].includes(x.task_type)){
      openDetail(r,'checklist')
      return
    }
    openDetail(r,'overview')
  }

  async function startConsultation(c){
    if(!has(member,'reservation_edit')){
      return alert('상담 상태 변경 권한이 없습니다.')
    }

    const now=new Date().toISOString()
    const patch={
      status:'contacting',
      updated_at:now
    }

    if(!c.first_contact_at)patch.first_contact_at=now
    if(!c.assigned_to)patch.assigned_to=session.user.id

    const {data,error}=await supabase
      .from('ops_consultations')
      .update(patch)
      .eq('organization_id',ORG)
      .eq('id',c.id)
      .select()
      .single()

    if(error)return alert(error.message)

    setConsultationModal(data)
    await loadAll()
  }

  async function convertConsultation(c){
    if(!has(member,'reservation_create')||!has(member,'reservation_edit')){
      return alert('예약 생성 및 상담 전환 권한이 필요합니다.')
    }

    if(c.reservation_id){
      const linked=rows.find(r=>r.id===c.reservation_id)
      setConsultationModal(null)
      if(linked)openDetail(linked,'overview')
      return
    }

    if(!confirm(
      `${c.customer_name} 고객 상담을 신규 예약으로 전환하시겠습니까?\n예약 상태는 '문의'로 생성됩니다.`
    ))return

    const {data,error}=await supabase.rpc(
      'convert_consultation_to_reservation',
      {p_consultation_id:c.id}
    )

    if(error)return alert(error.message)

    const result=Array.isArray(data)?data[0]:data
    if(!result?.reservation_id){
      return alert('예약 전환 결과를 확인할 수 없습니다.')
    }

    await syncReservationToGoogleSheets('create',result.reservation_id)

    const {data:created}=await supabase
      .from('ops_reservations')
      .select('*')
      .eq('organization_id',ORG)
      .eq('id',result.reservation_id)
      .maybeSingle()

    setConsultationModal(null)
    await loadAll()

    alert(`예약 전환이 완료되었습니다.\n예약번호: ${result.reservation_code||''}`)

    if(created)openDetail(created,'overview')
  }

  async function quickReservationUpdate(reservationId,patch,successMessage){
    if(!has(member,'reservation_edit'))return alert('예약 수정 권한이 없습니다.')
    const {error}=await supabase.from('ops_reservations').update(patch).eq('organization_id',ORG).eq('id',reservationId)
    if(error)return alert(error.message)
    if(successMessage)alert(successMessage)
    await loadAll()
  }

  function openBalancePayment(x){
    if(!has(member,'payment_manage'))return alert('고객 입금 등록 권한이 없습니다.')
    const r=rows.find(v=>v.id===x.reservation_id)
    if(!r)return
    const remaining=Math.max(0,num(r.receivable_amount))
    setPaymentModal({mode:'create',reservation_id:r.id,reservation_code:r.reservation_code,customer_name:r.customer_name,payment_date:new Date().toISOString().slice(0,10),payment_type:'balance',payment_method:'transfer',amount:remaining||'',note:'잔금 입금'})
  }

  function openPaymentEdit(p){
    if(!has(member,'payment_manage'))return alert('고객 입금 수정 권한이 없습니다.')
    const r=rows.find(v=>v.id===p.reservation_id)
    if(!r)return
    setPaymentModal({mode:'edit',id:p.id,reservation_id:r.id,reservation_code:r.reservation_code,customer_name:r.customer_name,payment_date:p.payment_date||'',payment_type:p.payment_type||'balance',payment_method:p.payment_method||'transfer',amount:p.amount||'',note:p.note||''})
  }

  async function deletePayment(p){
    if(!has(member,'payment_manage'))return alert('고객 입금 삭제 권한이 없습니다.')
    if(!confirm(`${p.payment_type==='refund'?'환불':'입금'} 내역을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`))return
    const {error}=await supabase.from('ops_payments').delete().eq('organization_id',ORG).eq('id',p.id)
    if(error)return alert(error.message)
    await loadAll()
  }

  async function saveBalancePayment(){
    if(!paymentModal||!has(member,'payment_manage'))return
    const amount=num(paymentModal.amount)
    if(amount<=0)return alert('입금액을 입력해 주세요.')
    const payload={payment_date:paymentModal.payment_date||new Date().toISOString().slice(0,10),payment_type:paymentModal.payment_type||'balance',payment_method:paymentModal.payment_method||'transfer',amount,note:paymentModal.note||null}
    const {error}=paymentModal.mode==='edit'
      ?await supabase.from('ops_payments').update(payload).eq('organization_id',ORG).eq('id',paymentModal.id)
      :await supabase.from('ops_payments').insert({...payload,organization_id:ORG,reservation_id:paymentModal.reservation_id,created_by:session.user.id})
    if(error)return alert(error.message)
    setPaymentModal(null)
    await loadAll()
  }

  function todayQuickActions(x){
    const r=rows.find(v=>v.id===x.reservation_id)
    if(!r)return null
    if(x.task_type==='customer_balance')return <div className="todayQuickActions"><button className="quickPrimary" disabled={!has(member,'payment_manage')} onClick={()=>openBalancePayment(x)}>입금 등록</button>{r.fx_currency&&!r.fx_notice_done&&<button className="quickSecondary" disabled={!has(member,'reservation_edit')} onClick={()=>quickReservationUpdate(r.id,{fx_notice_done:true,fx_notice_at:new Date().toISOString().slice(0,10)},'환율 변동 안내를 완료 처리했습니다.')}>환율 안내 완료</button>}</div>
    if(x.task_type==='final_check')return <div className="todayQuickActions"><button className="quickPrimary" disabled={!has(member,'reservation_edit')} onClick={()=>quickReservationUpdate(r.id,{final_check_done:true},'최종체크를 완료 처리했습니다.')}>최종체크 완료</button></div>
    if(x.task_type==='passport_copy')return <div className="todayQuickActions"><button className="quickPrimary" disabled={!has(member,'reservation_edit')} onClick={()=>quickReservationUpdate(r.id,{passport_copy_received:true,passport_copy_received_at:new Date().toISOString().slice(0,10)},'여권사본 수령을 완료 처리했습니다.')}>여권 수령 완료</button></div>
    if(x.task_type==='intermediate_air')return <div className="todayQuickActions">{!r.intermediate_air_deposit_paid&&<button className="quickPrimary" disabled={!has(member,'reservation_edit')} onClick={()=>quickReservationUpdate(r.id,{intermediate_air_deposit_paid:true,intermediate_air_deposit_paid_at:new Date().toISOString().slice(0,10)},'중간항공 중도금 결제를 확인 처리했습니다.')}>중도금 결제 확인</button>}{!r.intermediate_air_nonrefundable_notice_done&&<button className="quickSecondary" disabled={!has(member,'reservation_edit')} onClick={()=>quickReservationUpdate(r.id,{intermediate_air_nonrefundable_notice_done:true,intermediate_air_nonrefundable_notice_at:new Date().toISOString().slice(0,10)},'중간항공 환불불가 안내를 완료 처리했습니다.')}>환불불가 안내 완료</button>}</div>
    if(x.task_type==='land_work')return <div className="todayQuickActions"><button className="quickSecondary" disabled={!has(member,'expense_view')} onClick={()=>goToLandAnomaly({reservation_id:x.reservation_id})}>송금관리</button></div>
    return null
  }

  const CHANGE_FIELD_LABEL={vendor_name:'거래처',currency:'통화',contract_foreign_amount:'계약 외화금액',contract_exchange_rate:'계약 환율',contract_amount_krw:'계약 원화금액',confirmed_date:'계약 확정일',remittance_template_id:'송금조건 템플릿',remittance_template_name_snapshot:'적용 템플릿',remittance_template_snapshot:'적용 송금조건',land_contract_id:'연결 계약',remittance_stage:'송금 단계',due_date:'송금 예정일',paid_date:'실제 송금일',foreign_amount:'송금 외화금액',exchange_rate:'송금 환율',amount_krw:'송금 원화금액',status:'예약/송금 상태',settlement_status:'정산 상태',sale_amount:'판매금액',memo:'예약 메모',manager_name:'담당자',assigned_staff_id:'배정 직원',balance_notice_done:'잔금 안내',final_check_done:'최종체크',insurance_done:'여행자보험',gift_done:'사은품',contract_written:'계약서 작성',groom_passport_checked:'신랑 여권 확인',bride_passport_checked:'신부 여권 확인',briefing_notice_done:'설명회 안내',briefing_at:'설명회 일시',partner_remittance_deadline:'거래처 송금기한',partner_remittance_done:'거래처 송금완료',partner_remittance_date:'거래처 송금일',partner_remittance_amount:'거래처 송금액',ticketed:'항공 발권',ticketed_at:'항공 발권일',supplier_confirmation_received:'공급처 확정서 수령',balance_due_date:'잔금 기한',travel_docs_delivered:'여행서류 전달',air_recheck_done:'항공 재확인',passport_copy_received:'여권사본 수령',passport_copy_received_at:'여권사본 수령일',intermediate_air_segment_exists:'중간항공 여부',intermediate_air_deposit_paid:'중간항공 중도금',intermediate_air_deposit_paid_at:'중간항공 중도금 결제일',intermediate_air_nonrefundable_notice_done:'중간항공 환불불가 안내',intermediate_air_nonrefundable_notice_at:'환불불가 안내일',fx_currency:'환율 적용 통화',balance_exchange_rate:'잔금 환율',fx_foreign_amount_per_person:'1인 외화 적용액',exchange_adjustment_amount:'환율 조정액',fx_notice_done:'환율 변동 안내',fx_notice_at:'환율 안내일',payment_date:'입금일',payment_type:'입금/환불 구분',payment_method:'결제수단',amount:'입금/환불 금액',traveler_type:'여행자 구분',traveler_role:'여행자 역할',full_name:'한글 이름',english_name:'영문 이름',phone:'연락처',birth_date:'생년월일',gender:'성별',passport_no:'여권번호',passport_expiry:'여권 만료일',passport_checked:'여권 검증',is_primary:'대표 여행자',passport_verified_at:'여권 검증일시',segment_type:'항공 구간',segment_role:'항공 구간',airline:'항공사',flight_no:'편명',pnr:'PNR',departure_airport:'출발공항',arrival_airport:'도착공항',departure_at:'출발일시',arrival_at:'도착일시',ticketing_deadline:'발권마감',issuer:'발권처',hotel_name:'호텔명',room_type:'객실타입',meal_plan:'밀플랜',check_in:'체크인',check_out:'체크아웃',rooms:'객실수',confirmation_no:'확정번호',supplier_name:'공급처',free_cancel_deadline:'무료취소 마감',honeymoon_benefit_requested:'허니문 베네핏 요청',document_type:'문서 종류',title:'문서 제목',file_url:'문서 파일 URL',delivered:'문서 전달완료',delivered_at:'문서 전달일시',note:'메모'}
  const CHANGE_ENTITY_LABEL={reservation:'예약 운영',payment:'고객 입금·환불',traveler:'고객·여행자',air_booking:'항공 예약',hotel_booking:'호텔 예약',document:'고객 전달 문서',land_contract:'랜드사 계약',land_remittance:'랜드사 송금'}

  const CHILD_CREATE_DELETE_TITLE={
    traveler:'여행자',air_booking:'항공 예약',hotel_booking:'호텔 예약',document:'문서',
    land_contract:'랜드사 계약',land_remittance:'랜드사 송금',payment:'고객 입금·환불'
  }
  function changeActor(userId){
    if(!userId)return '시스템'
    const m=members.find(x=>x.user_id===userId)
    return m?.display_name||m?.name||m?.email||'직원'
  }
  function changesForReservation(reservationId){
    return reservationChanges.filter(x=>x.reservation_id===reservationId)
  }
  function changeTitle(ch){
    const entity=CHILD_CREATE_DELETE_TITLE[ch.entity_type]||'정보'
    if(ch.action==='create')return `${entity} 등록`
    if(ch.action==='delete')return `${entity} 삭제`
    return CHANGE_FIELD_LABEL[ch.field_name]||ch.field_name||'정보 변경'
  }
  function changeEntityLabel(ch){return CHANGE_ENTITY_LABEL[ch?.entity_type]||ch?.entity_type||'예약'}
  function compactChangeValue(v){
    if(v===null||v===undefined||v==='')return '-'
    if(v===true||v==='true')return '완료/예'
    if(v===false||v==='false')return '미완료/아니오'
    const text=String(v)
    if(text.length>80)return `${text.slice(0,77)}…`
    return text
  }

  function remittanceRows(reservationId){
    return expenses.filter(e=>e.reservation_id===reservationId && e.expense_type==='land')
  }

  function reservationContracts(reservationId){
    return landContracts.filter(c=>c.reservation_id===reservationId)
  }

  function remittanceSummary(r){
    const list=remittanceRows(r.id)
    const contracts=reservationContracts(r.id)
    const contractTotal=contracts.reduce((a,c)=>a+num(c.contract_amount_krw),0)
    const planned=list.reduce((a,e)=>a+num(e.amount_krw),0)
    const paid=list.filter(remittancePaid).reduce((a,e)=>a+num(e.amount_krw),0)
    const pending=Math.max(0,contractTotal-paid)
    const unplanned=Math.max(0,contractTotal-planned)
    const next=list.filter(e=>!remittancePaid(e)&&e.due_date).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)))[0]
    const stageDone=Object.fromEntries(Object.keys(REMIT_STAGE).map(k=>[k,list.some(e=>e.remittance_stage===k&&remittancePaid(e))]))
    return {list,contracts,contractTotal,planned,paid,pending,unplanned,next,stageDone}
  }

  const landRemittanceTasks=useMemo(()=>{
    const today=new Date();today.setHours(0,0,0,0)
    const dueTasks=expenses.filter(e=>e.expense_type==='land'&&!remittancePaid(e)&&e.due_date).map(e=>{
      const r=rows.find(x=>x.id===e.reservation_id)
      const days=dayDiff(today,e.due_date)
      if(!r||days===null||days>7)return null
      return {
        key:`expense-${e.id}`,kind:'due',reservation:r,expense:e,days,
        priority:days<0?0:days<=3?1:2,
        tone:days<0?'danger':days<=3?'urgent':'warn',
        label:days<0?`기한 ${Math.abs(days)}일 경과`:days===0?'오늘 송금':`D-${days}`,
        title:`${REMIT_STAGE[e.remittance_stage]||'랜드사 송금'} ${won(e.amount_krw)}`,
        vendor:e.vendor_name||r.partner_name||'랜드사 미지정'
      }
    }).filter(Boolean)
    const planTasks=rows.map(r=>{
      const d=dayDiff(today,r.departure_date)
      if(d===null||d<0||d>30)return null
      const sm=remittanceSummary(r)
      if(sm.contractTotal<=0||sm.unplanned<=0)return null
      return {
        key:`plan-${r.id}`,kind:'plan',reservation:r,days:d,priority:3,tone:'info',
        label:`출발 D-${d}`,title:`송금계획 미등록 ${won(sm.unplanned)}`,
        vendor:sm.contracts.map(c=>c.vendor_name).filter(Boolean).join(', ')||r.partner_name||'랜드사 미지정'
      }
    }).filter(Boolean)
    return [...dueTasks,...planTasks].sort((a,b)=>a.priority-b.priority||a.days-b.days||String(a.reservation.departure_date||'').localeCompare(String(b.reservation.departure_date||'')))
  },[expenses,rows,landContracts])


  const LAND_WORKFLOW_LABEL={
    contract_missing:'계약금액 등록',plan_missing:'송금계획 생성',application_pending:'신청금 송금',
    interim_pending:'중도금 송금',balance_pending:'잔금 송금',remaining_balance:'미송금 잔액 확인',complete:'완료'
  }
  function workflowForReservation(reservationId){
    return landWorkflow.find(x=>x.reservation_id===reservationId)||null
  }
  function workflowTone(step){
    if(step==='complete')return 'ok'
    if(step==='contract_missing'||step==='remaining_balance')return 'danger'
    if(step==='plan_missing')return 'warn'
    return 'wait'
  }
  function dueBasisLabel(basis){
    return ({departure_d30:'출발 D-30',contract_confirmed:'계약 확정일',application_due:'신청금 예정일',interim_due:'중도금 예정일',balance_due:'잔금 예정일',next_remittance_due:'다음 송금 예정일',not_available:'자동기준 없음'})[basis]||''
  }
  const landChecklistTasks=useMemo(()=>{
    const today=new Date();today.setHours(0,0,0,0)
    return landWorkQueue.filter(w=>w.work_status!=='completed').map(w=>{
      const days=dayDiff(today,w.departure_date)
      const taskDays=w.task_due_date?dayDiff(today,w.task_due_date):null
      const priority=w.task_timing_status==='overdue'?0:w.task_timing_status==='today'?1:w.task_timing_status==='due_3d'?2:days!==null&&days<=7?3:days!==null&&days<=30?4:5
      return {...w,days,taskDays,priority,label:LAND_WORKFLOW_LABEL[w.current_step]||w.current_step}
    }).filter(w=>w.days===null||w.days>=0).sort((a,b)=>a.priority-b.priority||(a.taskDays??9999)-(b.taskDays??9999)||(a.days??9999)-(b.days??9999))
  },[landWorkQueue])

  const landTaskBuckets=useMemo(()=>({
    mine:landChecklistTasks.filter(x=>x.assignee_user_id===session?.user?.id),
    overdue:landChecklistTasks.filter(x=>x.task_timing_status==='overdue'),
    today:landChecklistTasks.filter(x=>x.task_timing_status==='today'),
    due3:landChecklistTasks.filter(x=>x.task_timing_status==='due_3d'),
    scheduled:landChecklistTasks.filter(x=>x.task_timing_status==='scheduled')
  }),[landChecklistTasks,session?.user?.id])

  const canViewAllStaffWork=member?.role==='master'||has(member,'staff_manage')
  const effectiveStaffFilter=staffWorkFilter || (canViewAllStaffWork?'all':session?.user?.id||'')
  const selectedStaffSummary=useMemo(()=>{
    if(effectiveStaffFilter==='all'){
      return staffWorkSummary.reduce((a,x)=>({
        total_tasks:a.total_tasks+num(x.total_tasks),overdue_tasks:a.overdue_tasks+num(x.overdue_tasks),today_tasks:a.today_tasks+num(x.today_tasks),
        week_tasks:a.week_tasks+num(x.week_tasks),departures_7d:a.departures_7d+num(x.departures_7d),departures_30d:a.departures_30d+num(x.departures_30d),
        remittance_due_7d_amount:a.remittance_due_7d_amount+num(x.remittance_due_7d_amount)
      }),{total_tasks:0,overdue_tasks:0,today_tasks:0,week_tasks:0,departures_7d:0,departures_30d:0,remittance_due_7d_amount:0})
    }
    const key=effectiveStaffFilter==='__unassigned__'?null:effectiveStaffFilter
    return staffWorkSummary.find(x=>(x.user_id||null)===key)||{total_tasks:0,overdue_tasks:0,today_tasks:0,week_tasks:0,departures_7d:0,departures_30d:0,remittance_due_7d_amount:0}
  },[staffWorkSummary,effectiveStaffFilter])
  const selectedStaffTasks=useMemo(()=>{
    if(effectiveStaffFilter==='all')return landChecklistTasks
    if(effectiveStaffFilter==='__unassigned__')return landChecklistTasks.filter(x=>!x.assignee_user_id)
    return landChecklistTasks.filter(x=>x.assignee_user_id===effectiveStaffFilter)
  },[landChecklistTasks,effectiveStaffFilter])

  const completedWorkItems=useMemo(()=>landWorkHistory.filter(h=>h.action==='complete'),[landWorkHistory])
  const completedTodayCount=useMemo(()=>{const d=new Date().toISOString().slice(0,10);return completedWorkItems.filter(h=>String(h.created_at||'').slice(0,10)===d).length},[completedWorkItems])
  const completedWeekCount=useMemo(()=>{const now=Date.now();return completedWorkItems.filter(h=>{const t=new Date(h.created_at).getTime();return Number.isFinite(t)&&t>=now-7*86400000}).length},[completedWorkItems])
  function workHistoryForReservation(reservationId){return landWorkHistory.filter(h=>h.reservation_id===reservationId)}
  function openTaskComplete(w){
    if(!has(member,'expense_manage'))return
    setTaskCompleteModal({assignment_id:w.assignment_id,reservation_id:w.reservation_id,reservation_code:w.reservation_code,customer_name:w.customer_name,workflow_step:w.current_step,completion_note:''})
  }
  async function completeLandTask(e){
    e.preventDefault()
    if(!taskCompleteModal?.assignment_id)return alert('업무 배정정보를 확인할 수 없습니다.')
    const {error}=await supabase.from('ops_land_work_assignments').update({work_status:'completed',completed_by:session.user.id,completed_at:new Date().toISOString(),completion_note:taskCompleteModal.completion_note||null,updated_at:new Date().toISOString()}).eq('organization_id',ORG).eq('id',taskCompleteModal.assignment_id)
    if(error)return alert(error.message)
    setTaskCompleteModal(null);await loadAll()
  }
  async function reopenLandTask(h){
    if(!has(member,'expense_manage')||!h.assignment_id)return
    if(!confirm('이 업무를 다시 미완료 상태로 전환할까요?'))return
    const {error}=await supabase.from('ops_land_work_assignments').update({work_status:'open',completed_by:null,completed_at:null,completion_note:null,updated_at:new Date().toISOString()}).eq('organization_id',ORG).eq('id',h.assignment_id)
    if(error)return alert(error.message)
    await loadAll()
  }

  function openTaskAssignment(w){
    if(!has(member,'expense_manage'))return
    setTaskAssignModal({reservation_id:w.reservation_id,reservation_code:w.reservation_code,customer_name:w.customer_name,workflow_step:w.current_step,assignee_user_id:w.assignee_user_id||'',due_date:w.task_due_date||w.next_due_date||'',note:w.task_note||'',due_date_source:w.due_date_source||'auto',due_date_basis:w.due_date_basis||''})
  }

  async function saveTaskAssignment(e){
    e.preventDefault()
    const payload={organization_id:ORG,reservation_id:taskAssignModal.reservation_id,workflow_step:taskAssignModal.workflow_step,assignee_user_id:taskAssignModal.assignee_user_id||null,due_date:taskAssignModal.due_date||null,note:taskAssignModal.note||null,created_by:session.user.id,assignment_source:'manual',due_date_source:'manual',updated_at:new Date().toISOString()}
    const {error}=await supabase.from('ops_land_work_assignments').upsert(payload,{onConflict:'organization_id,reservation_id,workflow_step'})
    if(error){alert(error.message);return}
    setTaskAssignModal(null);await loadAll()
  }

  const LAND_ANOMALY_LABEL={
    overpaid_contract:'계약액 초과 송금',
    balance_paid_but_remaining:'잔금 후 미송금 잔액',
    planned_over_contract:'송금계획 계약액 초과',
    contract_fx_missing:'계약 환율 누락',
    remittance_fx_missing:'송금 환율 누락',
    remittance_overdue:'송금기한 경과',
    contract_missing_near_departure:'출발임박 계약 미등록'
  }
  const landAnomalySummary=useMemo(()=>({
    danger:landAnomalies.filter(x=>x.severity==='danger').length,
    warning:landAnomalies.filter(x=>x.severity!=='danger').length
  }),[landAnomalies])

  function goToLandAnomaly(issue){
    const r=rows.find(x=>x.id===issue.reservation_id)
    if(!r)return
    const type=r.product_type
    if(type&&TYPE[type])setPage(type)
    setTimeout(()=>{
      const el=document.getElementById(`remit-${r.id}`)
      el?.scrollIntoView({behavior:'smooth',block:'center'})
      if(el){el.classList.add('validationFocus');setTimeout(()=>el.classList.remove('validationFocus'),2200)}
    },120)
  }

  function goToLandRemittance(task){
    const type=task?.reservation?.product_type
    if(type&&TYPE[type])setPage(type)
    setTimeout(()=>document.getElementById(`remit-${task.reservation.id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),120)
  }

  function openContract(r){
    if(!has(member,'expense_manage'))return
    setContractModal({reservation_id:r.id,reservation_code:r.reservation_code,customer_name:r.customer_name,vendor_name:r.partner_name||'',currency:'USD',contract_foreign_amount:'',contract_exchange_rate:'',contract_amount_krw:'',confirmed_date:'',note:''})
  }

  function templatesForVendor(vendor){
    const name=String(vendor||'').trim()
    return remitTemplates.filter(t=>t.is_active!==false && (!name || t.vendor_name===name))
  }

  function shiftDate(base,days){
    if(!base)return null
    const d=new Date(`${base}T00:00:00`)
    if(Number.isNaN(d.getTime()))return null
    d.setDate(d.getDate()+Number(days||0))
    return d.toISOString().slice(0,10)
  }

  async function createRemittancePlan(contract,reservation,templateId){
    if(!templateId)return
    const items=remitTemplateItems.filter(i=>i.template_id===templateId).sort((a,b)=>num(a.sort_order)-num(b.sort_order))
    if(!items.length)return
    const baseAmount=num(contract.contract_amount_krw)
    const plan=items.map(i=>{
      const amount=i.calc_type==='fixed_krw'?num(i.calc_value):Math.round(baseAmount*num(i.calc_value)/100)
      const base=i.due_basis==='contract'?(contract.confirmed_date||new Date().toISOString().slice(0,10)):reservation.departure_date
      return {organization_id:ORG,reservation_id:contract.reservation_id,vendor_name:contract.vendor_name,expense_type:'land',land_contract_id:contract.id,remittance_stage:i.remittance_stage,due_date:shiftDate(base,i.due_offset_days),currency:'KRW',foreign_amount:amount,exchange_rate:1,amount_krw:amount,status:'pending',note:'랜드사 송금조건 템플릿 자동생성',created_by:session.user.id}
    }).filter(x=>x.amount_krw>0)
    if(plan.length){
      const {error}=await supabase.from('ops_expenses').insert(plan)
      if(error)throw error
    }
  }

  function blankTemplateForm(extra={}){
    return {id:null,vendor_name:'',template_name:'기본 송금조건',application_percent:'',application_days:'0',interim_percent:'',interim_days:'',balance_percent:'',balance_days:'',note:'',...extra}
  }

  function templateFormFrom(t,{copy=false}={}){
    const items=remitTemplateItems.filter(i=>i.template_id===t.id)
    const byStage=Object.fromEntries(items.map(i=>[i.remittance_stage,i]))
    const app=byStage.application, interim=byStage.interim, balance=byStage.balance
    return blankTemplateForm({
      id:copy?null:t.id,
      vendor_name:t.vendor_name||'',
      template_name:copy?`${t.template_name} 복사본`:t.template_name||'기본 송금조건',
      application_percent:app?.calc_type==='percent'?String(app.calc_value):'',
      application_days:app?String(Math.max(0,num(app.due_offset_days))):'0',
      interim_percent:interim?.calc_type==='percent'?String(interim.calc_value):'',
      interim_days:interim?String(Math.abs(num(interim.due_offset_days))):'',
      balance_percent:balance?.calc_type==='percent'?String(balance.calc_value):'',
      balance_days:balance?String(Math.abs(num(balance.due_offset_days))):'',
      note:t.note||''
    })
  }

  function templateUsageCount(templateId){
    return landContracts.filter(c=>c.remittance_template_id===templateId).length
  }

  function openTemplateManager(){
    if(!has(member,'expense_manage'))return
    setTemplateManagerOpen(true)
  }

  function openNewTemplate(){ setTemplateModal(blankTemplateForm()) }
  function editTemplate(t){ setTemplateModal(templateFormFrom(t)) }
  function copyTemplate(t){ setTemplateModal(templateFormFrom(t,{copy:true})) }

  async function toggleTemplateActive(t){
    if(!has(member,'expense_manage'))return
    const {error}=await supabase.from('ops_land_remittance_templates').update({is_active:t.is_active===false,updated_at:new Date().toISOString()}).eq('organization_id',ORG).eq('id',t.id)
    if(error)return alert(error.message)
    await loadAll()
  }

  async function saveRemittanceTemplate(){
    if(!templateModal||!has(member,'expense_manage'))return
    const vendor=String(templateModal.vendor_name||'').trim()
    if(!vendor)return alert('거래처(랜드사)를 입력해 주세요.')
    const stages=[
      ['application',num(templateModal.application_percent),'contract',num(templateModal.application_days),1],
      ['interim',num(templateModal.interim_percent),'departure',-Math.abs(num(templateModal.interim_days)),2],
      ['balance',num(templateModal.balance_percent),'departure',-Math.abs(num(templateModal.balance_days)),3]
    ].filter(x=>x[1]>0)
    const total=stages.reduce((a,x)=>a+x[1],0)
    if(!stages.length)return alert('신청금·중도금·잔금 중 하나 이상의 비율을 입력해 주세요.')
    if(total>100)return alert('송금 비율 합계는 100%를 초과할 수 없습니다.')
    const templatePayload={vendor_name:vendor,template_name:String(templateModal.template_name||'기본 송금조건').trim(),note:templateModal.note||null,updated_at:new Date().toISOString()}
    let t
    if(templateModal.id){
      const {data,error}=await supabase.from('ops_land_remittance_templates').update(templatePayload).eq('organization_id',ORG).eq('id',templateModal.id).select().single()
      if(error)return alert(error.message)
      t=data
      const {error:delError}=await supabase.from('ops_land_remittance_template_items').delete().eq('template_id',t.id)
      if(delError)return alert(delError.message)
    }else{
      const {data,error}=await supabase.from('ops_land_remittance_templates').insert({organization_id:ORG,...templatePayload,created_by:session.user.id}).select().single()
      if(error)return alert(error.message)
      t=data
    }
    const items=stages.map(([stage,value,basis,offset,order])=>({template_id:t.id,remittance_stage:stage,calc_type:'percent',calc_value:value,due_basis:basis,due_offset_days:offset,sort_order:order}))
    const {error:itemError}=await supabase.from('ops_land_remittance_template_items').insert(items)
    if(itemError)return alert(itemError.message)
    setTemplateModal(null);await loadAll()
  }

  async function saveContract(){
    if(!contractModal||!has(member,'expense_manage'))return
    if(!String(contractModal.vendor_name||'').trim())return alert('거래처(랜드사)를 입력해 주세요.')
    const foreign=num(contractModal.contract_foreign_amount), rate=num(contractModal.contract_exchange_rate)
    const krw=num(contractModal.contract_amount_krw)||(foreign&&rate?Math.round(foreign*rate):0)
    if(krw<=0)return alert('랜드사 총 계약금액을 입력해 주세요.')
    const selectedTemplate=contractModal.template_id?remitTemplates.find(t=>t.id===contractModal.template_id):null
    const selectedItems=selectedTemplate?remitTemplateItems.filter(i=>i.template_id===selectedTemplate.id).sort((a,b)=>num(a.sort_order)-num(b.sort_order)):[]
    const templateSnapshot=selectedTemplate?{template_id:selectedTemplate.id,vendor_name:selectedTemplate.vendor_name,template_name:selectedTemplate.template_name,items:selectedItems.map(i=>({remittance_stage:i.remittance_stage,calc_type:i.calc_type,calc_value:num(i.calc_value),due_basis:i.due_basis,due_offset_days:num(i.due_offset_days),sort_order:num(i.sort_order)}))}:null
    const payload={organization_id:ORG,reservation_id:contractModal.reservation_id,vendor_name:contractModal.vendor_name.trim(),currency:contractModal.currency||'KRW',contract_foreign_amount:foreign||0,contract_exchange_rate:rate||0,contract_amount_krw:krw,confirmed_date:contractModal.confirmed_date||null,note:contractModal.note||null,remittance_template_id:selectedTemplate?.id||null,remittance_template_name_snapshot:selectedTemplate?.template_name||null,remittance_template_snapshot:templateSnapshot,created_by:session.user.id}
    const {data:contract,error}=await supabase.from('ops_land_contracts').insert(payload).select().single()
    if(error)return alert(error.message)
    try{
      const reservation=rows.find(r=>r.id===contractModal.reservation_id)||{}
      await createRemittancePlan(contract,reservation,contractModal.template_id)
    }catch(planError){
      alert(`계약금액은 저장됐지만 송금계획 자동생성에 실패했습니다: ${planError.message}`)
    }
    setContractModal(null);await loadAll()
  }

  async function deleteContract(c){
    if(!has(member,'expense_manage')||!confirm(`${c.vendor_name} 계약금액을 삭제할까요?`))return
    const {error}=await supabase.from('ops_land_contracts').delete().eq('organization_id',ORG).eq('id',c.id)
    if(error)return alert(error.message)
    await loadAll()
  }

  function openRemittance(r){
    if(!has(member,'expense_manage'))return
    setRemitModal({
      reservation_id:r.id,
      reservation_code:r.reservation_code,
      customer_name:r.customer_name,
      vendor_name:r.partner_name||'',
      land_contract_id:reservationContracts(r.id).length===1?reservationContracts(r.id)[0].id:'',
      remittance_stage:'application',
      due_date:'',paid_date:'',currency:'USD',foreign_amount:'',exchange_rate:'',amount_krw:'',note:''
    })
  }

  async function saveRemittance(){
    if(!remitModal||!has(member,'expense_manage'))return
    if(!String(remitModal.vendor_name||'').trim())return alert('거래처(랜드사)를 입력해 주세요.')
    const currency=remitModal.currency||'KRW'
    const foreign=num(remitModal.foreign_amount), rate=num(remitModal.exchange_rate)
    const krw=num(remitModal.amount_krw)||(foreign&&rate?Math.round(foreign*rate):0)
    if(krw<=0)return alert('송금 금액을 입력해 주세요.')
    if(currency!=='KRW'&&(foreign<=0||rate<=0))return alert('외화 송금은 외화금액과 적용환율을 모두 입력해 주세요.')
    const payload={
      organization_id:ORG,reservation_id:remitModal.reservation_id,
      vendor_name:remitModal.vendor_name.trim(),expense_type:'land',
      land_contract_id:remitModal.land_contract_id||null,remittance_stage:remitModal.remittance_stage,
      due_date:remitModal.due_date||null,paid_date:remitModal.paid_date||null,
      currency,foreign_amount:currency==='KRW'?krw:foreign,
      exchange_rate:currency==='KRW'?1:rate,exchange_rate_date:remitModal.paid_date||remitModal.due_date||null,
      amount_krw:krw,status:remitModal.paid_date?'paid':'pending',
      note:remitModal.note||null,created_by:session.user.id
    }
    const {error}=await supabase.from('ops_expenses').insert(payload)
    if(error)return alert(error.message)
    setRemitModal(null);await loadAll()
  }

  async function markRemittancePaid(e){
    if(!has(member,'expense_manage'))return
    const today=new Date().toISOString().slice(0,10)
    const {error}=await supabase.from('ops_expenses').update({status:'paid',paid_date:e.paid_date||today}).eq('organization_id',ORG).eq('id',e.id)
    if(error)return alert(error.message)
    await loadAll()
  }

  function openCreate(productType){
    if(!has(member,'reservation_create'))return
    setModal({
      mode:'create',
      id:null,
      reservation_code:`AIL-${Date.now()}`,
      product_type:productType,
      title:'', destination:'', customer_name:'', customer_phone:'',
      partner_name:'', manager_name:member?.display_name||'',
      departure_date:'', return_date:'', traveler_count:2,
      status:'confirmed', settlement_status:'unsettled', sale_amount:0, memo:'',
      passport_copy_received:false, passport_copy_received_at:'',
      intermediate_air_segment_exists:false, intermediate_air_deposit_paid:false, intermediate_air_deposit_paid_at:'',
      intermediate_air_nonrefundable_notice_done:false, intermediate_air_nonrefundable_notice_at:'',
      fx_currency:'', contract_exchange_rate:'', balance_exchange_rate:'', fx_foreign_amount_per_person:'',
      fx_notice_done:false, fx_notice_at:''
    })
  }

  function openEdit(r){
    if(!has(member,'reservation_edit'))return
    setModal({mode:'edit',...r,departure_date:r.departure_date||'',return_date:r.return_date||''})
  }

  async function saveReservation(){
    if(!modal)return
    if(!String(modal.customer_name||'').trim()||!String(modal.title||'').trim()){
      return alert('고객명과 상품명은 필수입니다.')
    }
    const payload={
      reservation_code:modal.reservation_code,
      product_type:modal.product_type,
      title:modal.title,
      destination:modal.destination||null,
      customer_name:modal.customer_name,
      customer_phone:modal.customer_phone||null,
      partner_name:modal.partner_name||null,
      manager_name:modal.manager_name||null,
      departure_date:modal.departure_date||null,
      return_date:modal.return_date||null,
      traveler_count:Math.max(1,num(modal.traveler_count)),
      status:modal.status||'confirmed',
      settlement_status:modal.settlement_status||'unsettled',
      sale_amount:Math.max(0,num(modal.sale_amount)),
      memo:modal.memo||null,
      passport_copy_received:!!modal.passport_copy_received,
      passport_copy_received_at:modal.passport_copy_received ? (modal.passport_copy_received_at||new Date().toISOString().slice(0,10)) : null,
      intermediate_air_segment_exists:!!modal.intermediate_air_segment_exists,
      intermediate_air_deposit_paid:!!modal.intermediate_air_segment_exists&&!!modal.intermediate_air_deposit_paid,
      intermediate_air_deposit_paid_at:(modal.intermediate_air_segment_exists&&modal.intermediate_air_deposit_paid)?(modal.intermediate_air_deposit_paid_at||new Date().toISOString().slice(0,10)):null,
      intermediate_air_nonrefundable_notice_done:!!modal.intermediate_air_segment_exists&&!!modal.intermediate_air_nonrefundable_notice_done,
      intermediate_air_nonrefundable_notice_at:(modal.intermediate_air_segment_exists&&modal.intermediate_air_nonrefundable_notice_done)?(modal.intermediate_air_nonrefundable_notice_at||new Date().toISOString().slice(0,10)):null,
      fx_currency:modal.fx_currency||null,
      contract_exchange_rate:modal.fx_currency?num(modal.contract_exchange_rate):null,
      balance_exchange_rate:modal.fx_currency?num(modal.balance_exchange_rate):null,
      fx_foreign_amount_per_person:modal.fx_currency?num(modal.fx_foreign_amount_per_person):null,
      fx_notice_done:!!modal.fx_currency&&!!modal.fx_notice_done,
      fx_notice_at:(modal.fx_currency&&modal.fx_notice_done)?(modal.fx_notice_at||new Date().toISOString().slice(0,10)):null
    }
    let q
    if(modal.mode==='edit'){
      q=supabase.from('ops_reservations').update(payload).eq('organization_id',ORG).eq('id',modal.id)
    }else{
      q=supabase.from('ops_reservations').insert({...payload,organization_id:ORG,created_by:session.user.id})
    }
    const {data,error}=await q.select('id').single()
    if(error)return alert(error.message)
    await syncReservationToGoogleSheets('upsert',data.id)
    setModal(null); await loadAll()
  }

  async function deleteReservation(r){
    if(!has(member,'reservation_delete'))return
    if(!confirm(`${r.customer_name} 예약을 삭제하시겠습니까?`))return
    const {error}=await supabase.from('ops_reservations').delete().eq('organization_id',ORG).eq('id',r.id)
    if(error)return alert(error.message)
    await syncReservationToGoogleSheets('delete',r.id)
    await loadAll()
  }

  if(loading&&!session)return <div className="center">불러오는 중...</div>
  if(!session||passwordRecovery)return <Login passwordRecovery={passwordRecovery} notice={authNotice} onRecoveryComplete={message=>{setSession(null);setPasswordRecovery(false);setAuthNotice(message)}}/>
  if(!member)return <div className="center">{error||'권한 확인 중...'}</div>

  const nav=NAV.filter(n=>has(member,n[2]))
  const activeTitle = page==='dashboard'?'통합 예약 현황':page==='calendar'?'출발 캘린더':page==='airvi'?`${year}년 항공 발권 VI`:page==='staff'?'직원·권한 관리':TYPE[page]

  return <div className="shell">
    <aside className="side">
      <div className="brandBox"><b>A</b><div><strong>아일항공여행사</strong><span>통합 예약관리</span></div></div>
      <nav>{nav.map(([id,label])=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}>{label}</button>)}</nav>
      <div className="sideFoot"><span>{member.email}</span><button onClick={()=>supabase.auth.signOut()}><LogOut size={14}/>로그아웃</button></div>
    </aside>
    <main>
      <header className="top">
        <div><small>RESERVATION CONTROL</small><h1>{activeTitle}</h1>
        <p>{page==='calendar'?'예약 출발일과 진행상태가 자동으로 연동됩니다.':'예약부터 입금·지출·최종 정산까지 한곳에서 관리합니다.'}</p></div>
        {(page==='honeymoon'||page==='package'||page==='air'||page==='group')&&has(member,'reservation_create')&&
          <button className="primary" onClick={()=>openCreate(page)}><Plus size={18}/> 새 예약 등록</button>}
      </header>

      {error&&<div className="errorBox">{error}</div>}

      {(page==='dashboard'||['honeymoon','package','air','group'].includes(page))&&<>
        {overdue.length>0&&<section className="alertBox">
          <div><small>거래처 송금 알림</small><strong>{overdue.length}건의 송금 확인이 필요합니다.</strong></div>
          {overdue.slice(0,3).map(r=><div className="alertRow" key={r.id}><b>{r.customer_name} · {r.title}</b><span>출발 {ymd(r.departure_date)}</span><em>송금기한 {ymd(r.partner_remittance_deadline)}</em></div>)}
        </section>}
        <section className="periodBar periodBarStack">
          <div className="periodTop">
            <div><small>기간별 통계</small><b>{statsMode==='reservation'?'출발일 기준 예약통계':'실제 입금일·지출일 기준 회계통계'}</b><span className="scopeHint">{page==='dashboard'?'전체 예약':`${TYPE[page]} 예약만 집계`}</span></div>
            <div className="periodTopActions"><div className="statsMode">
              <button className={statsMode==='reservation'?'active':''} onClick={()=>setStatsMode('reservation')}>예약통계</button>
              <button className={statsMode==='accounting'?'active':''} onClick={()=>setStatsMode('accounting')}>회계통계</button>
            </div>{has(member,'settlement_view')&&<button className="reportBtn" onClick={openProfitReport}>수익 보고서</button>}</div>
          </div>
          <div className="filters"><label>연도<select value={year} onChange={e=>setYear(Number(e.target.value))}>{yearOptions.map(y=><option key={y}>{y}</option>)}</select></label>
          {['year','quarter','half','month'].map(p=><button className={period===p?'active':''} onClick={()=>changePeriod(p)} key={p}>{p==='year'?'연도별':p==='quarter'?'분기별':p==='half'?'상·하반기':'월별'}</button>)}</div>
        </section>
        {period!=='year'&&<div className="subFilter">
          {period==='quarter'&&[1,2,3,4].map(x=><button className={String(periodValue)===String(x)?'active':''} onClick={()=>setPeriodValue(String(x))}>{x}분기</button>)}
          {period==='half'&&[1,2].map(x=><button className={String(periodValue)===String(x)?'active':''} onClick={()=>setPeriodValue(String(x))}>{x===1?'상반기':'하반기'}</button>)}
          {period==='month'&&Array.from({length:12},(_,i)=>i+1).map(x=><button className={String(periodValue)===String(x)?'active':''} onClick={()=>setPeriodValue(String(x))}>{x}월</button>)}
        </div>}
        <section className="cards">
          <div><span>{statsMode==='reservation'?'예약 건수':'출발 예약 건수'}</span><strong>{reservationStats.count}건</strong><small>총 {reservationStats.people}명</small></div>
          <div><span>총 매출</span><strong>{won(reservationStats.sale)}</strong><small>출발일 기준 선택기간 판매금액</small></div>
          <div><span>{statsMode==='reservation'?'해당 예약 누적 입금':'실제 기간 입금'}</span><strong>{won(stats.paid)}</strong><small>{statsMode==='reservation'?`미수·초과 ${won(stats.balance)}`:`입금 ${accountingStats.paymentCount}건`}</small></div>
          <div><span>{statsMode==='reservation'?'예상 순이익':'기간 현금흐름'}</span><strong>{won(statsMode==='reservation'?stats.profit:accountingStats.paid-accountingStats.expense)}</strong><small>{statsMode==='reservation'?`총 지출 ${won(stats.expense)}`:`실제 지출 ${won(accountingStats.expense)} · ${accountingStats.expenseCount}건`}</small></div>
        </section>

        {(overpaymentRows.length>0 || zeroSalePaidRows.length>0 || uncategorizedTotal>0) && <section className="dataWarn">
          <div className="warnHead"><strong>⚠ 데이터 점검 필요</strong><span>기간 통계 왜곡 가능 항목</span></div>
          {zeroSalePaidRows.length>0 && <button type="button" className="warnItem warnItemClickable" onClick={()=>openQualityModal('zero_sale_paid')}><b>매출 0원인데 입금 존재</b><span>{zeroSalePaidRows.length}건 · {won(zeroSalePaidRows.reduce((a,r)=>a+r.paid,0))}<em>해당 건 보기 →</em></span></button>}
          {overpaymentRows.length>0 && <button type="button" className="warnItem warnItemClickable" onClick={()=>openQualityModal('overpayment')}><b>매출보다 입금이 많은 예약</b><span>{overpaymentRows.length}건 · 초과 {won(overpaymentRows.reduce((a,r)=>a+r.overpaid,0))}<em>해당 건 보기 →</em></span></button>}
          {uncategorizedTotal>0 && <button type="button" className="warnItem warnItemClickable" onClick={()=>openQualityModal('uncategorized')}><b>기타·미분류 원가</b><span>{uncategorizedReservationRows.length}건 · {won(uncategorizedTotal)}<em>해당 건 보기 →</em></span></button>}
          <details><summary>점검 대상 상세 보기</summary>
            <div className="warnDetails">
              {overpaymentRows.slice(0,20).map(r=><div key={r.id}><span>{r.customer_name} · {ymd(r.departure_date)}</span><b>초과 {won(r.overpaid)}</b></div>)}
            </div>
          </details>
        </section>}

        <section className="dashboardVisuals" aria-label="선택 기간 통계 그래프">
          <article className="vizCard vizWide">
            <div className="vizHead"><div><h3>월별 추이</h3><p>출발일 기준 · 매출 / 입금 / 예상 순이익</p></div><span>{reportPeriodLabel()}</span></div>
            <div className="trendLegend"><span className="sale">매출</span><span className="paid">입금</span><span className="profit">예상 순이익</span></div>
            <div className="trendChart">{dashboardAnalytics.months.map(m=>{const max=Math.max(1,...dashboardAnalytics.months.flatMap(x=>[x.sale,x.paid,Math.max(0,x.profit)]));return <div className="trendCol" key={`trend-${m.month}`} title={`${m.month}월 · 매출 ${won(m.sale)} · 입금 ${won(m.paid)} · 순이익 ${won(m.profit)}`}><div className="trendBars"><i className="barSale" style={{height:`${Math.max(3,m.sale/max*100)}%`}}/><i className="barPaid" style={{height:`${Math.max(3,m.paid/max*100)}%`}}/><i className="barProfit" style={{height:`${Math.max(3,Math.max(0,m.profit)/max*100)}%`}}/></div><b>{m.month}월</b></div>})}</div>
          </article>
          <article className="vizCard">
            <div className="vizHead"><div><h3>{page==='dashboard'?'상품별 매출 비중':'지역·상품 매출 비중'}</h3><p>{page==='dashboard'?'전체 상품 구성':'선택 현황의 상위 지역 구성'}</p></div></div>
            {(()=>{const mix=page==='dashboard'?dashboardAnalytics.productMix:dashboardAnalytics.destinationTop;const total=mix.reduce((a,x)=>a+x.value,0);let cursor=0;const palette=['#2f6bd8','#24a36f','#ef9b2d','#8b6ad9','#55a6c9'];const stops=mix.map((x,i)=>{const start=cursor;cursor+=total?x.value/total*100:0;return `${palette[i%palette.length]} ${start}% ${cursor}%`}).join(',');return <div className="donutWrap"><div className="donut" style={{background:total?`conic-gradient(${stops})`:'#edf2f7'}}><div><small>총 매출</small><b>{won(total)}</b></div></div><div className="donutLegend">{mix.slice(0,5).map((x,i)=><div key={`mix-${x.label}`}><i style={{background:palette[i%palette.length]}}/><span>{x.label}</span><b>{total?`${(x.value/total*100).toFixed(1)}%`:'0%'}</b><small>{won(x.value)}</small></div>)}</div></div>})()}
          </article>
          <article className="vizCard">
            <div className="vizHead"><div><h3>지역별 매출 TOP 5</h3><p>선택 기간 최종 매출 기준</p></div></div>
            <div className="rankBars">{dashboardAnalytics.destinationTop.map((x,i)=>{const max=dashboardAnalytics.destinationTop[0]?.value||1;return <div key={`dest-${x.label}`}><span>{x.label}</span><div><i style={{width:`${x.value/max*100}%`}}/></div><b>{won(x.value)}</b></div>})}</div>
          </article>
          <article className="vizCard">
            <div className="vizHead"><div><h3>담당자별 매출 현황</h3><p>예약 담당자 기준</p></div></div>
            <div className="rankBars managerBars">{dashboardAnalytics.managerTop.map((x,i)=>{const max=dashboardAnalytics.managerTop[0]?.value||1;return <div key={`mgr-${x.label}`}><span>{x.label}</span><div><i style={{width:`${x.value/max*100}%`}}/></div><b>{won(x.value)}</b></div>})}</div>
          </article>
          <article className="vizCard paymentViz">
            <div className="vizHead"><div><h3>입금 현황</h3><p>선택 예약의 누적 입금 기준</p></div></div>
            <div className="paymentGauge" style={{'--rate':`${Math.min(100,Math.max(0,dashboardAnalytics.paymentRate))}%`}}><div><strong>{dashboardAnalytics.paymentRate.toFixed(1)}%</strong><small>입금률</small></div></div>
            <div className="paymentLegend"><div><i className="paid"/><span>누적 입금</span><b>{won(dashboardAnalytics.paid)}</b></div><div><i className="due"/><span>미수금</span><b>{won(dashboardAnalytics.receivable)}</b></div><div><i className="over"/><span>초과 입금</span><b>{won(dashboardAnalytics.overpaid)}</b></div></div>
          </article>
        </section>
      </>}

      {page==='dashboard'&&<>
        <section className="panel masterTodayWorkCenter">
          <div className="panelHead"><div><h2>오늘 업무센터</h2><p>고객 잔금·최종체크·여권·중간항공·랜드사 업무를 하나의 우선순위 큐로 관리합니다.</p></div><span className={`badge ${todayWorkSummary.overdue?'dangerBadge':''}`}>긴급·7일내 {todayWorkSummary.overdue+todayWorkSummary.today+todayWorkSummary.due3+todayWorkSummary.due7}건</span></div>
          <div className="todayCenterStats"><div className={todayWorkSummary.overdue?'danger':''}><span>지연</span><b>{todayWorkSummary.overdue}</b></div><div><span>오늘</span><b>{todayWorkSummary.today}</b></div><div className={todayWorkSummary.due3?'warn':''}><span>D-3</span><b>{todayWorkSummary.due3}</b></div><div><span>D-7</span><b>{todayWorkSummary.due7}</b></div><div><span>잔금</span><b>{todayWorkSummary.balance}</b></div><div><span>최종체크</span><b>{todayWorkSummary.final}</b></div><div><span>여권</span><b>{todayWorkSummary.passport}</b></div><div><span>랜드사</span><b>{todayWorkSummary.land}</b></div></div>
          <div className="todayCenterFilters">{[['urgent','긴급·7일내'],['all','전체'],['customer_balance','잔금'],['final_check','최종체크'],['passport_copy','여권'],['intermediate_air','중간항공'],['land_work','랜드사']].map(([k,l])=><button key={k} className={todayWorkFilter===k?'active':''} onClick={()=>setTodayWorkFilter(k)}>{l}</button>)}</div>
          {visibleTodayWork.length===0?<div className="taskEmpty">선택한 조건의 업무가 없습니다.</div>:<div className="todayCenterList">{visibleTodayWork.slice(0,40).map((x,i)=><div key={`${x.task_type}-${x.reservation_id}-${i}`} className={`todayCenterRow ${todayWorkTone(x)}`}><button className="todayCenterMain" onClick={()=>goToTodayWork(x)}><span className="todayCenterFlag">{x.task_label||TODAY_WORK_LABEL[x.task_type]}</span><div className="todayCenterBody"><b>{x.customer_name} · {x.task_message}</b><small>{x.reservation_code} · {x.destination||x.product_type} · 출발 {ymd(x.departure_date)}{x.manager_name?` · 예약담당 ${x.manager_name}`:''}{x.assignee_name?` · 업무담당 ${x.assignee_name}`:''}{x.due_date?` · 처리기준 ${ymd(x.due_date)}`:''}</small></div><div className="todayCenterRight">{num(x.amount_krw)>0&&<small>{won(x.amount_krw)}</small>}<strong>{todayWorkTiming(x)} →</strong></div></button>{todayQuickActions(x)}</div>)}</div>}
          {visibleTodayWork.length>40&&<div className="todayCenterMore">상위 40건 표시 · 필터를 선택하면 업무 유형별로 확인할 수 있습니다.</div>}
        </section>
        {has(member,'expense_view')&&<section className="panel staffWorkDashboard">
          <div className="panelHead"><div><h2>직원별 랜드사 업무 대시보드</h2><p>담당자별 오늘 업무·지연·이번 주·출발임박·예정 송금액을 한 화면에서 확인합니다.</p></div>{canViewAllStaffWork?<label className="staffWorkSelector">직원 선택<select value={effectiveStaffFilter} onChange={e=>setStaffWorkFilter(e.target.value)}><option value="all">전체 직원</option>{staffWorkSummary.filter(x=>x.user_id).map(x=><option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}{staffWorkSummary.some(x=>!x.user_id)&&<option value="__unassigned__">담당 미지정</option>}</select></label>:<span className="badge">내 업무</span>}</div>
          <div className="staffWorkStats"><div><span>현재 업무</span><b>{num(selectedStaffSummary.total_tasks)}</b></div><div className="ok"><span>오늘 완료</span><b>{completedTodayCount}</b></div><div><span>7일 완료</span><b>{completedWeekCount}</b></div><div className={num(selectedStaffSummary.overdue_tasks)?'danger':''}><span>지연</span><b>{num(selectedStaffSummary.overdue_tasks)}</b></div><div><span>오늘</span><b>{num(selectedStaffSummary.today_tasks)}</b></div><div><span>이번 주</span><b>{num(selectedStaffSummary.week_tasks)}</b></div><div><span>7일 내 출발</span><b>{num(selectedStaffSummary.departures_7d)}</b></div><div><span>30일 내 출발</span><b>{num(selectedStaffSummary.departures_30d)}</b></div><div className="money"><span>7일 내 송금예정</span><b>{won(selectedStaffSummary.remittance_due_7d_amount)}</b></div></div>
          <div className="staffWorkTaskList">{selectedStaffTasks.length===0?<div className="taskEmpty">선택한 직원의 현재 랜드사 업무가 없습니다.</div>:selectedStaffTasks.slice(0,12).map(w=><div key={`staff-${w.reservation_id}`} className="staffWorkTaskRow"><button className={`staffWorkTask ${w.task_timing_status==='overdue'?'danger':w.task_timing_status==='today'?'today':''}`} onClick={()=>goToLandAnomaly({reservation_id:w.reservation_id})}><div><b>{w.customer_name} · {LAND_WORKFLOW_LABEL[w.current_step]||w.current_step}</b><small>{w.assignee_name||'담당 미지정'} · 출발 {ymd(w.departure_date)} · 처리 {ymd(w.task_due_date)}</small></div><strong>{w.task_timing_status==='overdue'?'지연':w.task_timing_status==='today'?'오늘':w.task_due_date?`D-${Math.max(0,dayDiff(new Date(),w.task_due_date))}`:'미지정'} →</strong></button>{has(member,'expense_manage')&&w.assignment_id&&<button className="taskDoneBtn" onClick={()=>openTaskComplete(w)}>처리완료</button>}</div>)}</div>
          {canViewAllStaffWork&&<div className="staffCompareWrap"><h3>직원별 업무량 비교</h3><div className="tableWrap"><table><thead><tr><th>담당</th><th>현재업무</th><th>지연</th><th>오늘</th><th>이번 주</th><th>7일 내 출발</th><th>7일 내 송금예정</th></tr></thead><tbody>{staffWorkSummary.map(x=><tr key={x.user_id||'unassigned'}><td><b>{x.display_name}</b></td><td>{x.total_tasks}건</td><td className={num(x.overdue_tasks)?'textDanger':''}>{x.overdue_tasks}건</td><td>{x.today_tasks}건</td><td>{x.week_tasks}건</td><td>{x.departures_7d}건</td><td>{won(x.remittance_due_7d_amount)}</td></tr>)}</tbody></table></div></div>}
          <div className="completedWorkPanel"><div className="completedWorkHead"><h3>최근 완료 업무</h3><span>최근 {Math.min(10,completedWorkItems.length)}건</span></div>{completedWorkItems.length===0?<div className="taskEmpty">아직 기록된 완료 업무가 없습니다.</div>:completedWorkItems.slice(0,10).map(h=>{const r=rows.find(x=>x.id===h.reservation_id);return <div className="completedWorkRow" key={h.id}><div><b>{r?.customer_name||r?.reservation_code||'예약'} · {LAND_WORKFLOW_LABEL[h.workflow_step]||h.workflow_step}</b><small>{changeActor(h.actor_user_id)} · {new Date(h.created_at).toLocaleString('ko-KR')} {h.note?`· ${h.note}`:''}</small></div><div className="completedActions"><span className="doneBadge">완료</span>{has(member,'expense_manage')&&<button className="secondary mini" onClick={()=>reopenLandTask(h)}>재오픈</button>}<button className="secondary mini" onClick={()=>setWorkHistoryReservation(h.reservation_id)}>이력</button></div></div>})}</div>
        </section>}
        {has(member,'expense_view')&&landChecklistTasks.length>0&&<section className="panel landChecklistPanel">
          <div className="panelHead"><div><h2>랜드사 업무 체크리스트</h2><p>담당자와 처리 예정일을 기준으로 내 업무·오늘·지연 업무를 자동 분류합니다.</p></div><span className="badge">미완료 {landChecklistTasks.length}건</span></div>
          <div className="landTaskSummary"><div><span>내 업무</span><b>{landTaskBuckets.mine.length}</b></div><div className={landTaskBuckets.overdue.length?'danger':''}><span>지연</span><b>{landTaskBuckets.overdue.length}</b></div><div><span>오늘 처리</span><b>{landTaskBuckets.today.length}</b></div><div className={landTaskBuckets.due3.length?'warn':''}><span>D-3 임박</span><b>{landTaskBuckets.due3.length}</b></div><div><span>예정</span><b>{landTaskBuckets.scheduled.length}</b></div></div>
          <div className="landChecklistList">{landChecklistTasks.slice(0,30).map(w=><div key={w.reservation_id} className={`landChecklistRow ${workflowTone(w.current_step)} ${w.task_timing_status==='overdue'?'taskOverdue':''}`}><button className="landTaskMain" onClick={()=>goToLandAnomaly({reservation_id:w.reservation_id})}><span className="checklistStepNo">{w.current_step==='contract_missing'?'1':w.current_step==='plan_missing'?'2':w.current_step==='application_pending'?'3':w.current_step==='interim_pending'?'4':w.current_step==='balance_pending'?'5':'!'}</span><div><b>{w.customer_name} · {w.label}</b><small>{w.reservation_code} · 출발 {ymd(w.departure_date)} · 담당 {w.assignee_name||'미지정'}{w.assignee_name?` · ${w.assignment_source==='reservation_manager'?'자동배정':'수동배정'}`:''}{w.task_due_date?` · 처리 ${ymd(w.task_due_date)}`:''}{w.task_due_date&&w.due_date_source==='auto'?` · 자동(${dueBasisLabel(w.due_date_basis)})`:w.task_due_date?' · 수동':''}</small></div><strong>{w.task_timing_status==='overdue'?'지연':w.task_timing_status==='today'?'오늘':w.task_timing_status==='due_3d'?`업무 D-${w.taskDays}`:w.taskDays!==null?`업무 D-${w.taskDays}`:w.days!==null?`출발 D-${w.days}`:'확인'} →</strong></button>{has(member,'expense_manage')&&<div className="taskRowActions"><button className="taskAssignBtn" onClick={()=>openTaskAssignment(w)}>담당 지정</button>{w.assignment_id&&<button className="taskDoneBtn" onClick={()=>openTaskComplete(w)}>처리완료</button>}<button className="taskHistoryBtn" onClick={()=>setWorkHistoryReservation(w.reservation_id)}>이력</button></div>}</div>)}</div>
        </section>}

        {has(member,'expense_view')&&landAnomalies.length>0&&<section className="panel landValidationPanel">
          <div className="panelHead"><div><h2>랜드사 송금 정산 이상 · 확인필요</h2><p>계약액·송금액·잔금·기한·환율을 자동 교차검증한 결과입니다.</p></div><div className="validationCounts"><span className="dangerBadge">긴급 {landAnomalySummary.danger}</span><span className="badge">확인필요 {landAnomalySummary.warning}</span></div></div>
          <div className="validationList">{landAnomalies.slice(0,30).map((x,i)=><button key={`${x.issue_code}-${x.reservation_id}-${x.land_contract_id||i}`} className={`validationRow ${x.severity==='danger'?'danger':'warning'}`} onClick={()=>goToLandAnomaly(x)}><span className="validationFlag">{x.severity==='danger'?'긴급':'확인필요'}</span><div><b>{x.customer_name} · {LAND_ANOMALY_LABEL[x.issue_code]||x.issue_code}</b><small>{x.vendor_name||'랜드사 미지정'} · 출발 {ymd(x.departure_date)} · {x.issue_message}</small></div><strong>확인 →</strong></button>)}</div>
        </section>}
        {has(member,'expense_view')&&<section className="panel todayLandTasks">
          <div className="panelHead"><div><h2>오늘 해야 할 랜드사 송금 업무</h2><p>신청금·중도금·잔금·추가송금 중 기한 7일 이내와 출발 30일 이내 송금계획 미등록 건을 자동 표시합니다.</p></div><span className={`badge ${landRemittanceTasks.some(t=>t.tone==='danger')?'dangerBadge':''}`}>{landRemittanceTasks.length}건</span></div>
          {landRemittanceTasks.length===0?<div className="taskEmpty">현재 기한이 임박한 랜드사 송금 업무가 없습니다.</div>:<div className="todayTaskList">{landRemittanceTasks.slice(0,30).map(t=><button key={t.key} className={`todayTask ${t.tone}`} onClick={()=>goToLandRemittance(t)}>
            <span className="taskFlag">{t.label}</span><div><b>{t.reservation.customer_name} · {t.title}</b><small>{t.vendor} · 출발 {ymd(t.reservation.departure_date)}</small></div><strong>송금관리 →</strong>
          </button>)}</div>}
        </section>}
        <section className="panel"><div className="panelHead"><div><h2>대시보드 기간 비교</h2><p>연도별 예약·매출 흐름</p></div></div>
          <div className="tableWrap"><table><thead><tr><th>확인 기간</th><th>예약/인원</th><th>매출</th><th>입금</th><th>지출</th><th>순이익</th></tr></thead>
          <tbody>{yearly.map(x=><tr key={x.y}><td><b>{x.y}년</b></td><td>{x.count}건 / {x.people}명</td><td>{won(x.sale)}</td><td>{won(x.paid)}</td><td>{won(x.expense)}</td><td className="profit">{won(x.profit)}</td></tr>)}</tbody></table></div>
        </section>
      </>}

      {['honeymoon','package','air','group'].includes(page)&&<>
        {page==='honeymoon'&&<section className="panel cost"><div className="panelHead"><div><h2>허니문 지출 원가 요약</h2><p>선택 기간 기준 · 지출 등록금액을 예약 원가로 집계</p></div><span className="badge">{productRows('honeymoon').filter(r=>expMap[r.id]>0).length}/{productRows('honeymoon').length}건 원가 등록</span></div>
          <div className="costGrid">
            <div><span>항공 원가</span><b>{won(expenses.filter(e=>productRows('honeymoon').some(r=>r.id===e.reservation_id)&&['international_air','domestic_air'].includes(e.expense_type)).reduce((a,e)=>a+num(e.amount_krw),0))}</b></div>
            <div><span>호텔 원가</span><b>{won(expenses.filter(e=>productRows('honeymoon').some(r=>r.id===e.reservation_id)&&e.expense_type==='hotel').reduce((a,e)=>a+num(e.amount_krw),0))}</b></div>
            <div><span>랜드 원가</span><b>{won(expenses.filter(e=>productRows('honeymoon').some(r=>r.id===e.reservation_id)&&e.expense_type==='land').reduce((a,e)=>a+num(e.amount_krw),0))}</b></div>
            <div className="uncat"><span>기타·미분류 원가</span><b>{won(expenses.filter(e=>productRows('honeymoon').some(r=>r.id===e.reservation_id)&&!['international_air','domestic_air','hotel','land'].includes(e.expense_type)).reduce((a,e)=>a+num(e.amount_krw),0))}</b><small>재분류 필요</small></div>
          </div></section>}
        <section className="panel"><div className="panelHead"><div><h2>{TYPE[page]} 예약내역</h2><p>선택 기간 예약 목록</p></div></div>
          <div className="tableWrap"><table><thead><tr><th>예약번호</th><th>고객</th><th>상품/지역</th><th>출발일</th><th>인원</th><th>여권사본</th><th>중간항공</th><th>매출</th><th>입금</th><th>지출</th><th>순이익</th><th>관리</th></tr></thead>
          <tbody>{productRows(page).map(r=>{const ps=passportStatus(r),ias=intermediateAirStatus(r);return <tr key={r.id}><td>{r.reservation_code}</td><td><b>{r.customer_name}</b></td><td>{r.title||r.destination}</td><td>{ymd(r.departure_date)}</td><td>{r.traveler_count}명</td><td><span className={`passportBadge ${ps.tone}`}>{ps.label}</span></td><td><span className={`passportBadge ${ias.tone}`}>{ias.label}</span></td><td>{won(r.sale_amount)}</td><td>{won(payMap[r.id])}</td><td>{won(expMap[r.id])}</td><td className="profit">{won(num(r.sale_amount)-num(expMap[r.id]))}</td><td><div className="actions"><button className="detailBtn" onClick={()=>openDetail(r)}>상세</button>{has(member,'reservation_edit')&&<button onClick={()=>openEdit(r)}>수정</button>}{has(member,'reservation_delete')&&<button className="danger" onClick={()=>deleteReservation(r)}>삭제</button>}</div></td></tr>})}</tbody></table></div>
        </section>

        {has(member,'expense_view')&&<section className="panel remittancePanel">
          <div className="panelHead"><div><h2>거래처(랜드사) 송금 진행현황</h2><p>신청금 → 중도금 → 잔금 → 추가송금을 예약별로 분할 관리합니다.</p></div><div className="panelHeadActions">{has(member,'expense_manage')&&<button className="secondary" onClick={openTemplateManager}>송금조건 템플릿</button>}<span className="badge">{productRows(page).filter(r=>remittanceRows(r.id).length>0).length}건 송금등록</span></div></div>
          <div className="remittanceList">{productRows(page).map(r=>{const sm=remittanceSummary(r);return <div className="remittanceCard" id={`remit-${r.id}`} key={`remit-${r.id}`}>
            <div className="remittanceTop"><div><b>{r.customer_name}</b><small>{r.reservation_code} · {r.partner_name||'랜드사 미지정'} · 출발 {ymd(r.departure_date)}</small></div>{has(member,'expense_manage')&&<div className="remitActions"><button className="secondary" onClick={()=>setHistoryReservation(r)}>변경이력</button><button className="secondary" onClick={()=>openContract(r)}>+ 계약금액</button><button className="secondary" onClick={()=>openRemittance(r)}>+ 송금 등록</button></div>}</div>
            {!has(member,'expense_manage')&&<div className="historyOnlyAction"><button className="secondary" onClick={()=>setHistoryReservation(r)}>변경이력</button></div>}
            {(()=>{const wf=workflowForReservation(r.id);if(!wf)return null;const q=landWorkQueue.find(x=>x.reservation_id===r.id);const steps=[['contract','계약 등록',wf.contract_count>0],['plan','송금계획',wf.planned_count>0],['application','신청금',!wf.application_planned||wf.application_paid],['interim','중도금',!wf.interim_planned||wf.interim_paid],['balance','잔금',!wf.balance_planned||wf.balance_paid]];return <div className="landWorkflowBox"><div className="workflowHead"><div><b>랜드사 업무 진행</b>{q&&<small className="workflowAssignee">담당 {q.assignee_name||'미지정'}{q.assignee_name?` · ${q.assignment_source==='reservation_manager'?'자동배정':'수동배정'}`:''}{q.task_due_date?` · 처리 ${ymd(q.task_due_date)}`:''}{q.task_due_date&&q.due_date_source==='auto'?` · 자동(${dueBasisLabel(q.due_date_basis)})`:q.task_due_date?' · 수동':''}</small>}</div><div className="workflowHeadActions"><span className={`passportBadge ${workflowTone(wf.current_step)}`}>{LAND_WORKFLOW_LABEL[wf.current_step]||wf.current_step}</span>{q&&has(member,'expense_manage')&&<><button className="secondary mini" onClick={()=>openTaskAssignment(q)}>담당 지정</button>{q.assignment_id&&<button className="secondary mini taskDoneMini" onClick={()=>openTaskComplete(q)}>처리완료</button>}<button className="secondary mini" onClick={()=>setWorkHistoryReservation(r.id)}>업무이력</button></>}</div></div><div className="workflowSteps">{steps.map(([key,label,done],idx)=><div key={key} className={`workflowStep ${done?'done':wf.current_step===({contract:'contract_missing',plan:'plan_missing',application:'application_pending',interim:'interim_pending',balance:'balance_pending'}[key])?'current':''}`}><span>{done?'✓':idx+1}</span><small>{label}</small></div>)}</div>{wf.remaining_amount>0&&<div className="workflowFoot"><span>남은 송금액</span><b>{won(wf.remaining_amount)}</b>{wf.next_due_date&&<small>다음 예정 {ymd(wf.next_due_date)}</small>}</div>}</div>})()}
            <div className="remittanceMoney"><div><span>랜드사 총 계약액</span><b>{won(sm.contractTotal)}</b></div><div><span>송금 예정 등록</span><b>{won(sm.planned)}</b></div><div><span>누적 실제 송금</span><b>{won(sm.paid)}</b></div><div><span>실제 미송금 잔액</span><b className={sm.pending>0?'textWarn':''}>{won(sm.pending)}</b></div><div><span>미배정 계약액</span><b className={sm.unplanned>0?'textWarn':''}>{won(sm.unplanned)}</b></div><div><span>다음 예정일</span><b>{sm.next?ymd(sm.next.due_date):'-'}</b></div></div>
            {sm.contracts.length>0&&<div className="contractRows">{sm.contracts.map(c=><div key={c.id}><span><b>{c.vendor_name}</b> · {c.currency}{num(c.contract_foreign_amount)>0?` ${num(c.contract_foreign_amount).toLocaleString()}`:''}</span><strong>{won(c.contract_amount_krw)}</strong><small>{c.confirmed_date?`계약확정 ${ymd(c.confirmed_date)}`:'계약일 미입력'}{c.remittance_template_name_snapshot?` · 템플릿 ${c.remittance_template_name_snapshot}`:''}</small>{has(member,'expense_manage')&&<button className="dangerMini" onClick={()=>deleteContract(c)}>삭제</button>}</div>)}</div>}
            {sm.contracts.length===0&&<div className="contractEmpty">랜드사 총 계약액이 아직 등록되지 않았습니다. 송금 잔액을 정확히 계산하려면 계약금액을 먼저 등록하세요.</div>}
            <div className="remittanceSteps">{Object.entries(REMIT_STAGE).map(([k,label])=>{const stageRows=sm.list.filter(e=>e.remittance_stage===k);const done=stageRows.some(remittancePaid);const pending=stageRows.find(e=>!remittancePaid(e));return <div className={`remitStep ${done?'done':stageRows.length?'pending':'empty'}`} key={k}><span>{done?'✓':stageRows.length?'!':'·'}</span><b>{label}</b><small>{stageRows.length?`${won(stageRows.reduce((a,e)=>a+num(e.amount_krw),0))}${pending?.due_date?` · ${ymd(pending.due_date)}`:''}`:'미등록'}</small></div>})}</div>
            {sm.list.length>0&&<div className="remittanceRows">{sm.list.slice().sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).map(e=><div key={e.id}><span>{REMIT_STAGE[e.remittance_stage]||'미분류'} · {e.vendor_name}</span><b>{won(e.amount_krw)}</b><small>{remittancePaid(e)?`송금완료 ${ymd(e.paid_date)}`:`예정 ${ymd(e.due_date)}`}</small>{!remittancePaid(e)&&has(member,'expense_manage')&&<button onClick={()=>markRemittancePaid(e)}>송금완료</button>}</div>)}</div>}
            {changesForReservation(r.id).length>0&&<div className="remitRecentHistory"><b>최근 변경</b>{changesForReservation(r.id).slice(0,3).map(ch=><span key={ch.id}>{new Date(ch.changed_at).toLocaleString('ko-KR')} · {changeActor(ch.changed_by)} · {changeTitle(ch)}</span>)}</div>}
          </div>})}</div>
        </section>}
      </>}

      {page==='calendar'&&<Calendar rows={rows} date={calendarDate} setDate={setCalendarDate}/>}

      {page==='airvi'&&<section className="panel viPanel">
        <div className="panelHead"><div><small>MONTHLY INPUT</small><h2>월별 발권 VI 입력</h2><p>각 월의 발권총액과 VI 금액을 직접 입력해주세요.</p></div>
          <label>확인 연도<select value={year} onChange={e=>setYear(Number(e.target.value))}>{yearOptions.map(y=><option key={y}>{y}년</option>)}</select></label></div>
        <div className="viGrid">{Array.from({length:12},(_,i)=>i+1).map(m=>{const v=vi.find(x=>x.year===Number(year)&&x.month===m)||{};return <div key={m}><h3>{m}월</h3><label>발권총액<input type="number" value={v.ticket_total||0} onChange={e=>updateVi(m,'ticket_total',e.target.value)}/></label><label>VI<input type="number" value={v.vi_amount||0} onChange={e=>updateVi(m,'vi_amount',e.target.value)}/></label></div>})}</div>
        <div className="viTotal"><b>합계</b><span>발권총액 {won(vi.filter(v=>v.year===Number(year)).reduce((a,v)=>a+num(v.ticket_total),0))}</span><span>VI {won(vi.filter(v=>v.year===Number(year)).reduce((a,v)=>a+num(v.vi_amount),0))}</span>{has(member,'air_vi_manage')&&<button className="primary" onClick={saveVi}>월별 내역 전체 저장</button>}</div>
      </section>}

      {page==='staff'&&<section className="staffGrid">
        <div className="panel"><div className="panelHead"><div><h2>사전 직원 등록</h2><p>가입 전에 이메일과 기본 권한을 등록할 수 있습니다.</p></div></div>
          <div className="staffForm"><label>직원 이름<input value={invite.display_name} onChange={e=>setInvite({...invite,display_name:e.target.value})}/></label><label>이메일<input value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/></label><label>기본 역할<select value={invite.role} onChange={e=>setInvite({...invite,role:e.target.value})}><option value="staff">직원</option><option value="manager">관리자</option><option value="viewer">조회전용</option></select></label></div>
          <div className="permGrid">{Object.entries(PERM).map(([k,l])=><button type="button" key={k} className={`permissionToggle ${invite.permissions[k]?'enabled':''}`} aria-pressed={!!invite.permissions[k]} onClick={()=>setInvite({...invite,permissions:{...invite.permissions,[k]:!invite.permissions[k]}})}><span>{l}</span><i>{invite.permissions[k]?'허용':'미허용'}</i></button>)}</div>
          <button className="wide primary" onClick={saveInvite}>직원 사전 등록</button>
        </div>
        <div className="panel"><div className="panelHead"><div><h2>등록 직원</h2><p>권한 토글을 눌러 즉시 부여하거나 해제할 수 있습니다.</p></div><span className="badge">{members.filter(m=>m.active).length}명 사용 중</span></div>
          <div>{members.map(m=><div className="staffPermissionCard" key={m.user_id}><div className="staffRow"><div><b>{m.display_name||m.email}</b><span>{m.email}</span></div><div>{roleLabel[m.role]||m.role}</div></div>{m.role==='master'?(member?.role==='master'&&m.user_id!==session.user.id?<div className="masterRoleControl"><label>역할 변경<select value="" onChange={e=>{if(e.target.value)changeMasterRole(m,e.target.value)}}><option value="" disabled>직원 역할 선택</option><option value="manager">관리자</option><option value="staff">직원</option><option value="viewer">조회전용</option></select></label><p>역할을 변경하면 마스터 권한이 해제되고, 아래 목록에서 항목별 권한을 설정할 수 있습니다.</p></div>:<p className="staffPermissionNotice">{m.user_id===session.user.id?'본인 마스터 계정의 역할은 변경할 수 없습니다.':'마스터는 모든 권한을 가집니다.'}</p>):<div className="memberPermGrid">{Object.entries(PERM).map(([k,l])=>{const enabled=!!m.permissions?.[k];const locked=m.user_id===session.user.id;return <button type="button" key={k} className={`permissionToggle ${enabled?'enabled':''}`} aria-pressed={enabled} disabled={locked} onClick={()=>toggleMemberPermission(m,k)}><span>{l}</span><i>{enabled?'허용':'미허용'}</i></button>})}</div>}</div>)}</div>
        </div>
        <div className="panel signupRequestsPanel"><div className="panelHead"><div><h2>회원가입 요청</h2><p>외부 이메일 API 없이 마스터가 직접 승인합니다. 승인 후 요청자에게 가입 가능 여부를 안내해 주세요.</p></div><span className="badge">대기 {signupRequests.filter(x=>x.status==='pending').length}건</span></div>
          <div className="signupRequestList">{signupRequests.length===0?<div className="taskEmpty">가입 요청이 없습니다.</div>:signupRequests.map(request=><div className="signupRequestRow" key={request.id}><div><b>{request.full_name}</b><span>{request.email} · 요청 {new Date(request.requested_at).toLocaleString('ko-KR')}</span></div><div className="signupRequestActions"><em className={`signupStatus ${request.status}`}>{request.status==='approved'?'승인됨':request.status==='rejected'?'반려됨':'승인 대기'}</em>{request.status==='pending'&&<><button className="secondary mini" onClick={()=>rejectSignupRequest(request)}>반려</button><button className="primary mini" onClick={()=>approveSignupRequest(request)}>승인</button></>}</div></div>)}</div>
        </div>
      </section>}
    </main>

     {consultationModal&&
      <div className="modalBack">
        <div className="modalBox reservationForm">
          <button
            type="button"
            className="close"
            onClick={()=>setConsultationModal(null)}
          >
            <X/>
          </button>

          <h2>신규 상담 상세</h2>

          <p className="modalIntro">
            {consultationModal.request_code} · {consultationModal.request_type}
          </p>

          <div className="modalGrid">
            <label>
              고객명
              <input readOnly value={consultationModal.customer_name||''}/>
            </label>

            <label>
              전화번호
              <input readOnly value={consultationModal.phone||''}/>
            </label>

            <label>
              희망여행지
              <input readOnly value={consultationModal.destination||''}/>
            </label>

            <label>
              출발예정일
              <input
                readOnly
                value={
                  ymd(consultationModal.departure_date)==='-'
                    ? ''
                    : ymd(consultationModal.departure_date)
                }
              />
            </label>

            <label>
              여행인원
              <input readOnly value={consultationModal.traveler_count||''}/>
            </label>

            <label>
              예상예산
              <input readOnly value={consultationModal.budget||''}/>
            </label>

            <label>
              예식일
              <input
                readOnly
                value={
                  ymd(consultationModal.wedding_date)==='-'
                    ? ''
                    : ymd(consultationModal.wedding_date)
                }
              />
            </label>

            <label>
              상담상태
              <input
                readOnly
                value={
                  ({
                    new:'신규',
                    contacting:'상담중',
                    quoted:'견적발송',
                    contracted:'계약완료',
                    converted:'예약전환',
                    hold:'보류',
                    closed:'종료'
                  })[consultationModal.status]
                  ||consultationModal.status
                  ||''
                }
              />
            </label>

            <label className="span2">
              요청사항
              <textarea
                rows="4"
                readOnly
                value={consultationModal.request_memo||'별도 요청사항 없음'}
              />
            </label>
          </div>

          <div className="modalActions">
            <button
              type="button"
              className="secondary"
              onClick={()=>setConsultationModal(null)}
            >
              닫기
            </button>

            <button
              type="button"
              className="secondary"
              onClick={()=>{
                window.location.href=
                  `tel:${String(consultationModal.phone||'').replace(/[^0-9+]/g,'')}`
              }}
            >
              전화하기
            </button>

            <button
              type="button"
              disabled={
                consultationModal.status!=='new'
                ||!has(member,'reservation_edit')
              }
              onClick={()=>startConsultation(consultationModal)}
            >
              {consultationModal.status==='new'
                ? '상담 시작'
                : '상담 진행중'}
            </button>

            <button
              type="button"
              className="primary"
              disabled={
                !!consultationModal.reservation_id
                ||!has(member,'reservation_create')
                ||!has(member,'reservation_edit')
              }
              onClick={()=>convertConsultation(consultationModal)}
            >
              {consultationModal.reservation_id
                ? '예약 연결완료'
                : '예약으로 전환'}
            </button>
          </div>
        </div>
      </div>
    }
    {taskCompleteModal&&<div className="modalBack"><form className={`modalBox taskCompleteModal ${isModalDirty('completion',taskCompleteModal)?'hasUnsaved':''}`} onSubmit={completeLandTask}><button type="button" className="close" onClick={()=>closeEditableModal('completion',taskCompleteModal)}><X/></button><h2>랜드사 업무 처리완료</h2><p className="modalIntro">{taskCompleteModal.customer_name} · {taskCompleteModal.reservation_code} · {LAND_WORKFLOW_LABEL[taskCompleteModal.workflow_step]}</p><div className="completionCaution">업무 처리완료는 직원 처리 기록입니다. 실제 계약·신청금·중도금·잔금 상태는 계약·송금 데이터가 변경될 때만 다음 단계로 이동합니다.</div><label>완료 메모<textarea value={taskCompleteModal.completion_note||''} onChange={e=>setTaskCompleteModal({...taskCompleteModal,completion_note:e.target.value})} placeholder="처리 내용·확인사항·인수인계 메모"/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>closeEditableModal('completion',taskCompleteModal)}>닫기</button><button type="submit"><Save size={16}/> 처리완료</button></div></form></div>}
    {workHistoryReservation&&<div className="modalBack"><div className="modalBox workHistoryModal"><button type="button" className="close" onClick={()=>setWorkHistoryReservation(null)}><X/></button><h2>랜드사 업무 처리이력</h2><p className="modalIntro">{rows.find(r=>r.id===workHistoryReservation)?.customer_name||rows.find(r=>r.id===workHistoryReservation)?.reservation_code||'예약'}</p><div className="workHistoryList">{workHistoryForReservation(workHistoryReservation).length===0?<div className="taskEmpty">저장된 업무 처리이력이 없습니다.</div>:workHistoryForReservation(workHistoryReservation).map(h=><div className={`workHistoryItem ${h.action}`} key={h.id}><span className="historyDot"/><div><div className="workHistoryHead"><b>{h.action==='complete'?'처리완료':h.action==='reopen'?'재오픈':h.action==='create'?'업무 생성':'업무 수정'} · {LAND_WORKFLOW_LABEL[h.workflow_step]||h.workflow_step}</b><time>{new Date(h.created_at).toLocaleString('ko-KR')}</time></div><small>처리자 {changeActor(h.actor_user_id)}</small>{h.note&&<p>{h.note}</p>}</div></div>)}</div><div className="modalActions readOnlyClose"><button className="secondary" onClick={()=>setWorkHistoryReservation(null)}><X size={15}/> 닫기</button></div></div></div>}
    {taskAssignModal&&<div className="modalBack"><form className={`modalBox taskAssignModal ${isModalDirty('assignment',taskAssignModal)?'hasUnsaved':''}`} onSubmit={saveTaskAssignment}><button type="button" className="close" onClick={()=>closeEditableModal('assignment',taskAssignModal)}><X/></button><h2>랜드사 업무 담당 지정</h2><p className="modalIntro">{taskAssignModal.customer_name} · {taskAssignModal.reservation_code} · {LAND_WORKFLOW_LABEL[taskAssignModal.workflow_step]}</p>{taskAssignModal.due_date_source==='auto'&&<div className="autoDueHint">자동 예정일 · {dueBasisLabel(taskAssignModal.due_date_basis)||'업무 기준일'} 기준. 날짜를 수정해 저장하면 수동 예정일로 전환됩니다.</div>}<div className="formGrid"><label>담당 직원<select value={taskAssignModal.assignee_user_id||''} onChange={e=>setTaskAssignModal({...taskAssignModal,assignee_user_id:e.target.value})}><option value="">미지정</option>{members.filter(x=>x.active!==false).map(x=><option key={x.user_id} value={x.user_id}>{x.display_name||x.email} · {roleLabel[x.role]||x.role}</option>)}</select></label><label>처리 예정일<input type="date" value={taskAssignModal.due_date||''} onChange={e=>setTaskAssignModal({...taskAssignModal,due_date:e.target.value})}/></label><label className="wide">업무 메모<textarea value={taskAssignModal.note||''} onChange={e=>setTaskAssignModal({...taskAssignModal,note:e.target.value})} placeholder="인수인계·확인사항"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>closeEditableModal('assignment',taskAssignModal)}>닫기</button><button type="submit"><Save size={16}/> 저장</button></div></form></div>}

    {historyReservation&&<div className="modalBack"><div className="modalBox historyModalBox"><button className="close" onClick={()=>setHistoryReservation(null)}><X/></button><h2>랜드사 계약·송금 변경이력</h2><p className="modalIntro">{historyReservation.customer_name} · {historyReservation.reservation_code}</p><div className="historyTimeline">{changesForReservation(historyReservation.id).length===0?<div className="emptyState">기록된 변경이력이 없습니다.</div>:changesForReservation(historyReservation.id).map(ch=><div className="historyItem" key={ch.id}><div className="historyDot"></div><div><div className="historyItemHead"><b>{changeTitle(ch)}</b><span>{new Date(ch.changed_at).toLocaleString('ko-KR')}</span></div><small>{changeActor(ch.changed_by)} · {ch.entity_type==='land_contract'?'랜드사 계약':'랜드사 송금'}</small>{ch.action==='update'&&<div className="historyDiff"><span>{compactChangeValue(ch.old_value)}</span><em>→</em><strong>{compactChangeValue(ch.new_value)}</strong></div>}{ch.action!=='update'&&<p>{ch.note||changeTitle(ch)}</p>}</div></div>)}</div><div className="modalActions readOnlyClose"><button className="secondary" onClick={()=>setHistoryReservation(null)}><X size={15}/> 닫기</button></div></div></div>}

    {templateManagerOpen&&<div className="modalBack"><div className="modalBox templateManagerBox"><button className="close" onClick={()=>setTemplateManagerOpen(false)}><X/></button><div className="templateManagerHead"><div><h2>랜드사 송금조건 템플릿 관리</h2><p className="modalIntro">등록된 조건을 수정·복사·사용중지할 수 있습니다. 과거 계약에는 적용 당시 조건이 스냅샷으로 보존됩니다.</p></div><button className="primary" onClick={openNewTemplate}>+ 새 템플릿</button></div>
      <div className="templateManagerList">{remitTemplates.length===0?<div className="emptyState">등록된 송금조건 템플릿이 없습니다.</div>:remitTemplates.map(t=>{const items=remitTemplateItems.filter(i=>i.template_id===t.id).sort((a,b)=>num(a.sort_order)-num(b.sort_order));return <div className={`templateManagerRow ${t.is_active===false?'inactive':''}`} key={t.id}><div className="templateManagerMain"><div><b>{t.vendor_name}</b><strong>{t.template_name}</strong></div><span className={`passportBadge ${t.is_active===false?'muted':'ok'}`}>{t.is_active===false?'사용중지':'사용중'}</span></div><div className="templateConditionChips">{items.map(i=><span key={i.id}>{REMIT_STAGE[i.remittance_stage]||i.remittance_stage} {i.calc_type==='percent'?`${num(i.calc_value)}%`:won(i.calc_value)} · {i.due_basis==='contract'?`계약 후 ${Math.max(0,num(i.due_offset_days))}일`:`출발 ${Math.abs(num(i.due_offset_days))}일 전`}</span>)}</div><div className="templateManagerFoot"><small>적용 계약 {templateUsageCount(t.id)}건{t.note?` · ${t.note}`:''}</small><div><button onClick={()=>editTemplate(t)}>수정</button><button onClick={()=>copyTemplate(t)}>복사</button><button className={t.is_active===false?'':'dangerMini'} onClick={()=>toggleTemplateActive(t)}>{t.is_active===false?'사용재개':'사용중지'}</button></div></div></div>})}</div>
    </div></div>}

    {templateModal&&<div className="modalBack"><div className={`modalBox reservationForm ${isModalDirty('template',templateModal)?'hasUnsaved':''}`}><button className="close" onClick={()=>closeEditableModal('template',templateModal)}><X/></button><h2>{templateModal.id?'랜드사 송금조건 수정':'랜드사 송금조건 등록'}</h2><p className="modalIntro">랜드사별 실제 송금조건을 저장합니다. 비율 합계가 100% 미만이면 나머지는 미배정 계약액으로 남습니다.</p>
      <div className="modalGrid">
        <label>거래처(랜드사)<input value={templateModal.vendor_name||''} onChange={e=>setTemplateModal({...templateModal,vendor_name:e.target.value})}/></label>
        <label>템플릿명<input value={templateModal.template_name||''} onChange={e=>setTemplateModal({...templateModal,template_name:e.target.value})}/></label>
        <div className="span2 templateStage"><b>신청금</b><label>계약액 대비 %<input type="number" min="0" max="100" step="0.1" value={templateModal.application_percent||''} onChange={e=>setTemplateModal({...templateModal,application_percent:e.target.value})}/></label><label>계약 확정 후 N일<input type="number" min="0" value={templateModal.application_days||'0'} onChange={e=>setTemplateModal({...templateModal,application_days:e.target.value})}/></label></div>
        <div className="span2 templateStage"><b>중도금</b><label>계약액 대비 %<input type="number" min="0" max="100" step="0.1" value={templateModal.interim_percent||''} onChange={e=>setTemplateModal({...templateModal,interim_percent:e.target.value})}/></label><label>출발 N일 전<input type="number" min="0" value={templateModal.interim_days||''} onChange={e=>setTemplateModal({...templateModal,interim_days:e.target.value})}/></label></div>
        <div className="span2 templateStage"><b>잔금</b><label>계약액 대비 %<input type="number" min="0" max="100" step="0.1" value={templateModal.balance_percent||''} onChange={e=>setTemplateModal({...templateModal,balance_percent:e.target.value})}/></label><label>출발 N일 전<input type="number" min="0" value={templateModal.balance_days||''} onChange={e=>setTemplateModal({...templateModal,balance_days:e.target.value})}/></label></div>
        <label className="span2">비고<textarea rows="3" value={templateModal.note||''} onChange={e=>setTemplateModal({...templateModal,note:e.target.value})}/></label>
      </div><div className="templateTotal">입력 비율 합계 <b>{num(templateModal.application_percent)+num(templateModal.interim_percent)+num(templateModal.balance_percent)}%</b></div><div className="modalActions"><button className="secondary" onClick={()=>closeEditableModal('template',templateModal)}>닫기</button><button className="primary" onClick={saveRemittanceTemplate}><Save size={16}/> 템플릿 저장</button></div>
    </div></div>}

    {contractModal&&<div className="modalBack"><div className={`modalBox reservationForm ${isModalDirty('contract',contractModal)?'hasUnsaved':''}`}><button className="close" onClick={()=>closeEditableModal('contract',contractModal)}><X/></button><h2>랜드사 총 계약금액 등록</h2><p className="modalIntro">{contractModal.customer_name} · {contractModal.reservation_code}</p>
      <div className="modalGrid">
        <label>거래처(랜드사)<input value={contractModal.vendor_name||''} onChange={e=>setContractModal({...contractModal,vendor_name:e.target.value})}/></label>
        <label>계약 확정일<input type="date" value={contractModal.confirmed_date||''} onChange={e=>setContractModal({...contractModal,confirmed_date:e.target.value})}/></label>
        <label className="span2">송금조건 템플릿<select value={contractModal.template_id||''} onChange={e=>setContractModal({...contractModal,template_id:e.target.value})}><option value="">자동 생성 안 함</option>{templatesForVendor(contractModal.vendor_name).map(t=><option key={t.id} value={t.id}>{t.vendor_name} · {t.template_name}</option>)}</select><small>선택하면 계약 저장과 동시에 신청금·중도금·잔금 송금계획이 자동 생성됩니다.</small></label>
        <label>통화<select value={contractModal.currency||'USD'} onChange={e=>setContractModal({...contractModal,currency:e.target.value})}><option value="KRW">원화 KRW</option><option value="THB">태국 바트 THB</option><option value="USD">미국 달러 USD</option><option value="EUR">유럽 유로 EUR</option></select></label>
        <label>계약 외화금액<input type="number" min="0" step="0.01" value={contractModal.contract_foreign_amount||''} onChange={e=>setContractModal({...contractModal,contract_foreign_amount:e.target.value})}/></label>
        <label>계약 기준환율<input type="number" min="0" step="0.01" value={contractModal.contract_exchange_rate||''} onChange={e=>setContractModal({...contractModal,contract_exchange_rate:e.target.value})}/></label>
        <label>총 계약금액(원)<input type="number" min="0" value={contractModal.contract_amount_krw||''} onChange={e=>setContractModal({...contractModal,contract_amount_krw:e.target.value})} placeholder="비우면 외화×환율 자동계산"/></label>
        <label className="span2">비고<textarea rows="3" value={contractModal.note||''} onChange={e=>setContractModal({...contractModal,note:e.target.value})}/></label>
      </div><div className="modalActions"><button className="secondary" onClick={()=>closeEditableModal('contract',contractModal)}>닫기</button><button className="primary" onClick={saveContract}><Save size={16}/> 계약금액 저장</button></div>
    </div></div>}

    {remitModal&&<div className="modalBack remittanceBack"><div className={`modalBox remittanceModal ${isModalDirty('remittance',remitModal)?'hasUnsaved':''}`}><button className="close" onClick={()=>closeEditableModal('remittance',remitModal)}><X/></button><h2>랜드사 송금 등록</h2><p className="modalIntro">{remitModal.customer_name} · {remitModal.reservation_code}</p>
      <div className="modalGrid">
        <label>거래처(랜드사)<input value={remitModal.vendor_name||''} onChange={e=>setRemitModal({...remitModal,vendor_name:e.target.value})}/></label>
        <label>연결 계약<select value={remitModal.land_contract_id||''} onChange={e=>{const c=landContracts.find(x=>x.id===e.target.value);setRemitModal({...remitModal,land_contract_id:e.target.value,vendor_name:c?.vendor_name||remitModal.vendor_name,currency:c?.currency||remitModal.currency})}}><option value="">연결 안 함</option>{reservationContracts(remitModal.reservation_id).map(c=><option key={c.id} value={c.id}>{c.vendor_name} · {won(c.contract_amount_krw)}</option>)}</select></label>
        <label>송금 단계<select value={remitModal.remittance_stage} onChange={e=>setRemitModal({...remitModal,remittance_stage:e.target.value})}>{Object.entries(REMIT_STAGE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>송금 예정일<input type="date" value={remitModal.due_date||''} onChange={e=>setRemitModal({...remitModal,due_date:e.target.value})}/></label>
        <label>실제 송금일<input type="date" value={remitModal.paid_date||''} onChange={e=>setRemitModal({...remitModal,paid_date:e.target.value})}/></label>
        <label>통화<select value={remitModal.currency||'USD'} onChange={e=>setRemitModal({...remitModal,currency:e.target.value})}><option value="KRW">원화 KRW</option><option value="THB">태국 바트 THB</option><option value="USD">미국 달러 USD</option><option value="EUR">유럽 유로 EUR</option></select></label>
        <label>외화금액<input type="number" min="0" step="0.01" value={remitModal.foreign_amount||''} onChange={e=>setRemitModal({...remitModal,foreign_amount:e.target.value})}/></label>
        <label>적용환율<input type="number" min="0" step="0.01" value={remitModal.exchange_rate||''} onChange={e=>setRemitModal({...remitModal,exchange_rate:e.target.value})}/></label>
        <label>원화 송금액<input type="number" min="0" value={remitModal.amount_krw||''} onChange={e=>setRemitModal({...remitModal,amount_krw:e.target.value})} placeholder="비우면 외화×환율 자동계산"/></label>
        <label className="span2">비고<textarea rows="3" value={remitModal.note||''} onChange={e=>setRemitModal({...remitModal,note:e.target.value})}/></label>
      </div><div className="modalActions"><button className="secondary" onClick={()=>closeEditableModal('remittance',remitModal)}>닫기</button><button className="primary" onClick={saveRemittance}><Save size={16}/> 송금내역 저장</button></div>
    </div></div>}

    {detailReservation&&<div className="modalBack detailBack"><div className="modalBox reservationDetailBox">
      <button className="close" onClick={()=>setDetailReservation(null)}><X/></button>
      <div className="detailHero"><div><small>{detailReservation.reservation_code} · {TYPE[detailReservation.product_type]||detailReservation.product_type}</small><h2>{detailReservation.customer_name} · {detailReservation.title||detailReservation.destination}</h2><p>{detailReservation.destination||'-'} · 출발 {ymd(detailReservation.departure_date)} · {detailReservation.traveler_count||0}명 · 담당 {detailReservation.manager_name||'미지정'}</p></div><div className="detailHeroActions">{has(member,'reservation_edit')&&<button className="secondary" onClick={()=>{setDetailReservation(null);openEdit(detailReservation)}}>예약 수정</button>}<span className={`statusPill ${detailReservation.status||'confirmed'}`}>{detailReservation.status||'confirmed'}</span></div></div>
      <div className="detailTabs">{DETAIL_TABS.map(([id,label])=><button key={id} className={detailTab===id?'active':''} onClick={()=>setDetailTab(id)}>{label}</button>)}</div>
      <div className="detailBody">
        {detailTab==='overview'&&<div className="detailGrid">
          <section className="detailCard span2"><h3>예약 핵심정보</h3><div className="infoGrid"><div><span>고객</span><b>{detailReservation.customer_name}</b></div><div><span>연락처</span><b>{detailReservation.customer_phone||'-'}</b></div><div><span>상품</span><b>{detailReservation.title||'-'}</b></div><div><span>지역</span><b>{detailReservation.destination||'-'}</b></div><div><span>출발</span><b>{ymd(detailReservation.departure_date)}</b></div><div><span>귀국</span><b>{ymd(detailReservation.return_date)}</b></div><div><span>랜드사</span><b>{detailReservation.partner_name||'-'}</b></div><div><span>담당자</span><b>{detailReservation.manager_name||'-'}</b></div></div></section>
          <section className="detailCard"><div className="detailSectionHead"><h3>항공 예약</h3>{has(member,'reservation_edit')&&<button className="secondary mini" onClick={()=>openEntityModal('air')}>+ 항공</button>}</div>{reservationItems(airBookings,detailReservation.id).length===0?<div className="emptyMini">등록된 항공 예약 없음</div>:reservationItems(airBookings,detailReservation.id).map(a=><div className="miniRecord" key={a.id}><div className="recordLine"><b>{a.airline||'-'} {a.flight_no||''}</b>{has(member,'reservation_edit')&&<span className="recordActions"><button onClick={()=>openEntityModal('air',a)}>수정</button><button className="dangerText" onClick={()=>deleteOperationalEntity('air',a)}>삭제</button></span>}</div><span>{({international:'국제선',domestic:'국내선',intermediate:'중간항공'})[a.segment_role||a.segment_type]||'국제선'} · {a.departure_airport||'-'} → {a.arrival_airport||'-'}</span><small>{a.departure_at?new Date(a.departure_at).toLocaleString('ko-KR'):'일정 미등록'} · PNR {a.pnr||'-'} · {a.ticketed?'발권완료':'미발권'}</small></div>)}</section>
          <section className="detailCard"><div className="detailSectionHead"><h3>호텔 예약</h3>{has(member,'reservation_edit')&&<button className="secondary mini" onClick={()=>openEntityModal('hotel')}>+ 호텔</button>}</div>{reservationItems(hotelBookings,detailReservation.id).length===0?<div className="emptyMini">등록된 호텔 예약 없음</div>:reservationItems(hotelBookings,detailReservation.id).map(h=><div className="miniRecord" key={h.id}><div className="recordLine"><b>{h.hotel_name||'-'}</b>{has(member,'reservation_edit')&&<span className="recordActions"><button onClick={()=>openEntityModal('hotel',h)}>수정</button><button className="dangerText" onClick={()=>deleteOperationalEntity('hotel',h)}>삭제</button></span>}</div><span>{h.room_type||'-'} · {h.meal_plan||'-'}</span><small>{ymd(h.check_in)} ~ {ymd(h.check_out)} · {h.rooms||1}실 · {h.status||'-'}</small></div>)}</section>
          <section className="detailCard span2"><h3>랜드 서비스</h3>{reservationItems(landBookings,detailReservation.id).length===0?<div className="emptyMini">등록된 랜드 서비스 없음</div>:reservationItems(landBookings,detailReservation.id).map(l=><div className="miniRecord horizontal" key={l.id}><div><b>{l.supplier_name||'-'} · {l.service_name||'-'}</b><small>확정번호 {l.confirmation_no||'-'} · {l.status||'-'}</small></div><strong>{won(l.amount_krw)}</strong></div>)}</section>
        </div>}
        {detailTab==='travelers'&&<section className="detailCard"><div className="detailSectionHead"><h3>고객·여행자</h3><div className="detailHeadActions"><span>{reservationItems(travelers,detailReservation.id).length}명 등록</span>{has(member,'reservation_edit')&&<button className="primary mini" onClick={()=>openEntityModal('traveler')}>+ 여행자</button>}</div></div>{reservationItems(travelers,detailReservation.id).length===0?<div className="emptyState">등록된 여행자 상세정보가 없습니다.</div>:<div className="detailTableWrap"><table className="detailTable"><thead><tr><th>구분</th><th>여행자 역할</th><th>한글명</th><th>영문명</th><th>연락처</th><th>생년월일</th><th>여권번호</th><th>만료일</th><th>검증</th>{has(member,'reservation_edit')&&<th>관리</th>}</tr></thead><tbody>{reservationItems(travelers,detailReservation.id).map(t=><tr key={t.id}><td>{t.is_primary?'대표':t.traveler_type||'동행'}</td><td>{({groom:'신랑',bride:'신부',general:'일반'})[t.traveler_role]||'일반'}</td><td><b>{t.full_name||'-'}</b></td><td>{t.english_name||'-'}</td><td>{t.phone||'-'}</td><td>{ymd(t.birth_date)}</td><td>{t.passport_no||'-'}</td><td>{ymd(t.passport_expiry)}</td><td><span className={`passportBadge ${t.passport_checked?'ok':'wait'}`}>{t.passport_checked?'확인완료':'확인필요'}</span></td>{has(member,'reservation_edit')&&<td><span className="recordActions"><button onClick={()=>openEntityModal('traveler',t)}>수정</button><button className="dangerText" onClick={()=>deleteOperationalEntity('traveler',t)}>삭제</button></span></td>}</tr>)}</tbody></table></div>}</section>}
        {detailTab==='payments'&&<div className="detailGrid"><section className="detailCard span2"><div className="detailSectionHead"><h3>입금·환불</h3>{has(member,'payment_manage')&&<button className="primary mini" onClick={()=>openBalancePayment({reservation_id:detailReservation.id})}>+ 잔금 입금</button>}</div><div className="financeSummary"><div><span>최종 판매금액</span><b>{won(detailReservation.final_sale_amount||detailReservation.sale_amount)}</b></div><div><span>순입금</span><b>{won(paymentNet(detailReservation.id))}</b></div><div><span>미수금</span><b>{won(detailReservation.receivable_amount)}</b></div></div>{reservationItems(payments,detailReservation.id).length===0?<div className="emptyState">등록된 입금·환불 내역이 없습니다.</div>:<div className="detailTableWrap"><table className="detailTable"><thead><tr><th>일자</th><th>구분</th><th>방법</th><th>금액</th><th>비고</th>{has(member,'payment_manage')&&<th>관리</th>}</tr></thead><tbody>{reservationItems(payments,detailReservation.id).sort((a,b)=>String(a.payment_date||'').localeCompare(String(b.payment_date||''))).map(p=><tr key={p.id}><td>{ymd(p.payment_date)}</td><td>{p.payment_type==='refund'?'환불':p.payment_type==='deposit'?'계약금':p.payment_type==='interim'?'중도금':p.payment_type==='balance'?'잔금':'추가입금'}</td><td>{methodLabel[p.payment_method]||p.payment_method}</td><td className={p.payment_type==='refund'?'negative':''}>{p.payment_type==='refund'?'-':''}{won(p.amount)}</td><td>{p.note||'-'}</td>{has(member,'payment_manage')&&<td><span className="recordActions"><button onClick={()=>openPaymentEdit(p)}>수정</button><button className="dangerText" onClick={()=>deletePayment(p)}>삭제</button></span></td>}</tr>)}</tbody></table></div>}</section></div>}
        {detailTab==='expenses'&&<div className="detailGrid"><section className="detailCard span2"><div className="detailSectionHead"><h3>지출·랜드사 송금</h3><div>{has(member,'expense_manage')&&<><button className="secondary mini" onClick={()=>openContract(detailReservation)}>+ 계약금액</button><button className="primary mini" onClick={()=>openRemittance(detailReservation)}>+ 송금 등록</button></>}</div></div><div className="financeSummary"><div><span>전체 지출</span><b>{won(detailReservation.expense_amount)}</b></div><div><span>실제 지급</span><b>{won(expensePaidTotal(detailReservation.id))}</b></div><div><span>예상 이익</span><b>{won(detailReservation.expected_profit)}</b></div></div>{reservationItems(expenses,detailReservation.id).length===0?<div className="emptyState">등록된 지출 내역이 없습니다.</div>:<div className="detailTableWrap"><table className="detailTable"><thead><tr><th>거래처</th><th>유형/단계</th><th>예정일</th><th>지급일</th><th>금액</th><th>상태</th></tr></thead><tbody>{reservationItems(expenses,detailReservation.id).map(e=><tr key={e.id}><td>{e.vendor_name||'-'}</td><td>{e.expense_type||'-'}{e.remittance_stage?` · ${REMIT_STAGE[e.remittance_stage]||e.remittance_stage}`:''}</td><td>{ymd(e.due_date)}</td><td>{ymd(e.paid_date)}</td><td>{won(e.amount_krw)}</td><td><span className={`passportBadge ${remittancePaid(e)?'ok':'wait'}`}>{remittancePaid(e)?'지급완료':'예정'}</span></td></tr>)}</tbody></table></div>}</section></div>}
        {detailTab==='checklist'&&<div className="detailGrid"><section className="detailCard span2"><h3>출발 전 필수 체크</h3><div className="checkTiles"><div className={detailReservation.final_check_done?'done':'pending'}><span>D-45</span><b>최종체크</b><small>{detailReservation.final_check_done?'완료':'미완료'}</small></div><div className={detailReservation.receivable_amount<=0?'done':'pending'}><span>D-45</span><b>고객 잔금</b><small>{detailReservation.receivable_amount<=0?'완납':`미수 ${won(detailReservation.receivable_amount)}`}</small></div><div className={detailReservation.passport_copy_received?'done':'pending'}><span>D-30</span><b>여권사본</b><small>{detailReservation.passport_copy_received?`수령 ${ymd(detailReservation.passport_copy_received_at)}`:'미수령'}</small></div><div className={!detailReservation.intermediate_air_segment_exists||detailReservation.intermediate_air_deposit_paid?'done':'pending'}><span>중간항공</span><b>중도금</b><small>{!detailReservation.intermediate_air_segment_exists?'해당없음':detailReservation.intermediate_air_deposit_paid?'완료':'미결제'}</small></div><div className={!detailReservation.intermediate_air_segment_exists||detailReservation.intermediate_air_nonrefundable_notice_done?'done':'pending'}><span>중간항공</span><b>환불불가 안내</b><small>{!detailReservation.intermediate_air_segment_exists?'해당없음':detailReservation.intermediate_air_nonrefundable_notice_done?'완료':'미안내'}</small></div><div className={!detailReservation.fx_currency||detailReservation.fx_notice_done?'done':'pending'}><span>환율</span><b>잔금 변동안내</b><small>{!detailReservation.fx_currency?'해당없음':detailReservation.fx_notice_done?'완료':'미안내'}</small></div></div></section><section className="detailCard span2"><div className="detailSectionHead"><h3>고객 전달 문서</h3><div className="detailHeadActions"><span>{reservationItems(documents,detailReservation.id).filter(d=>d.delivered).length}/{reservationItems(documents,detailReservation.id).length} 전달</span>{has(member,'reservation_edit')&&<button className="primary mini" onClick={()=>openEntityModal('document')}>+ 문서</button>}</div></div>{reservationItems(documents,detailReservation.id).length===0?<div className="emptyState">등록된 문서가 없습니다.</div>:<div className="documentList">{reservationItems(documents,detailReservation.id).map(d=><div className="documentRow" key={d.id}><div><b>{d.title||docLabel(d.document_type)}</b><small>{docLabel(d.document_type)} · {d.note||'메모 없음'}</small></div><div className="documentActions"><span className={`passportBadge ${d.delivered?'ok':'wait'}`}>{d.delivered?'전달완료':'미전달'}</span>{has(member,'reservation_edit')&&<span className="recordActions"><button onClick={()=>openEntityModal('document',d)}>수정</button><button className="dangerText" onClick={()=>deleteOperationalEntity('document',d)}>삭제</button></span>}</div></div>)}</div>}</section></div>}
        {detailTab==='settlement'&&<div className="detailGrid"><section className="detailCard span2"><h3>정산·손익</h3><div className="settlementHero"><div><span>계약 판매가</span><b>{won(detailReservation.sale_amount)}</b></div><div><span>환율 조정</span><b>{won(detailReservation.exchange_adjustment_amount)}</b></div><div><span>최종 판매금액</span><b>{won(detailReservation.final_sale_amount||detailReservation.sale_amount)}</b></div><div><span>누적 입금</span><b>{won(detailReservation.paid_amount)}</b></div><div><span>미수금</span><b>{won(detailReservation.receivable_amount)}</b></div><div><span>총 지출</span><b>{won(detailReservation.expense_amount)}</b></div><div className="profitBox"><span>예상 손익</span><b>{won(detailReservation.expected_profit)}</b></div></div></section><section className="detailCard"><h3>환율 기준</h3><div className="infoList"><p><span>통화</span><b>{detailReservation.fx_currency?fxLabel[detailReservation.fx_currency]:'미적용'}</b></p><p><span>계약환율</span><b>{detailReservation.contract_exchange_rate||'-'}</b></p><p><span>잔금환율</span><b>{detailReservation.balance_exchange_rate||'-'}</b></p><p><span>1인 외화 적용액</span><b>{detailReservation.fx_foreign_amount_per_person||'-'}</b></p></div></section><section className="detailCard"><h3>정산 상태</h3><div className="infoList"><p><span>입금상태</span><b>{detailReservation.payment_status||'-'}</b></p><p><span>정산상태</span><b>{detailReservation.settlement_status||'-'}</b></p><p><span>데이터 점검</span><b>{num(detailReservation.issue_count)>0?`${detailReservation.issue_count}건 확인필요`:'정상'}</b></p></div></section></div>}
        {detailTab==='history'&&<div className="detailGrid"><section className="detailCard"><h3>예약 메모</h3><div className="memoBox">{detailReservation.memo||'등록된 예약 메모가 없습니다.'}</div></section><section className="detailCard"><h3>랜드사 업무 처리이력</h3>{workHistoryForReservation(detailReservation.id).length===0?<div className="emptyMini">처리이력 없음</div>:workHistoryForReservation(detailReservation.id).slice(0,12).map(h=><div className="miniRecord" key={h.id}><b>{h.action==='complete'?'처리완료':h.action==='reopen'?'재오픈':'업무변경'} · {LAND_WORKFLOW_LABEL[h.workflow_step]||h.workflow_step}</b><small>{new Date(h.created_at).toLocaleString('ko-KR')} · {changeActor(h.actor_user_id)}</small>{h.note&&<span>{h.note}</span>}</div>)}</section><section className="detailCard span2"><h3>변경이력</h3>{changesForReservation(detailReservation.id).length===0?<div className="emptyState">저장된 변경이력이 없습니다.</div>:<div className="historyTimeline compact">{changesForReservation(detailReservation.id).slice(0,30).map(ch=><div className="historyItem" key={ch.id}><div className="historyDot"></div><div><div className="historyItemHead"><b>{changeTitle(ch)}</b><span>{new Date(ch.changed_at).toLocaleString('ko-KR')}</span></div><small>{changeActor(ch.changed_by)} · {changeEntityLabel(ch)}</small>{ch.action==='update'&&<div className="historyDiff"><span>{compactChangeValue(ch.old_value)}</span><em>→</em><strong>{compactChangeValue(ch.new_value)}</strong></div>}{ch.note&&<p>{ch.note}</p>}</div></div>)}</div>}</section></div>}
      </div>
      <div className="detailFooter"><button className="secondary closeDetailBtn" onClick={()=>setDetailReservation(null)}><X size={16}/> 닫기</button></div>
    </div></div>}

    {entityModal&&<div className="modalBack"><div className={`modalBox operationalModal ${isModalDirty('entity',entityModal)?'hasUnsaved':''}`}><button className="close" onClick={()=>closeEditableModal('entity',entityModal)}><X/></button><h2>{entityModal.mode==='edit'?'수정':'추가'} · {ENTITY_META[entityModal.type]?.label}</h2><p className="modalLead">{detailReservation?.customer_name} · {detailReservation?.reservation_code}</p>
      {entityModal.type==='traveler'&&<div className="modalGrid"><label>구분<select value={entityModal.traveler_type||'adult'} onChange={e=>setEntityModal({...entityModal,traveler_type:e.target.value})}><option value="adult">성인</option><option value="child">아동</option><option value="infant">유아</option><option value="companion">동행</option></select></label><label>여행자 역할<select value={entityModal.traveler_role||'general'} onChange={e=>setEntityModal({...entityModal,traveler_role:e.target.value})}><option value="groom">신랑</option><option value="bride">신부</option><option value="general">일반</option></select></label><label className="checkField"><span>대표 고객</span><input type="checkbox" checked={!!entityModal.is_primary} onChange={e=>setEntityModal({...entityModal,is_primary:e.target.checked})}/></label><label>한글명<input value={entityModal.full_name||''} onChange={e=>setEntityModal({...entityModal,full_name:e.target.value})}/></label><label>영문명<input value={entityModal.english_name||''} onChange={e=>setEntityModal({...entityModal,english_name:e.target.value.toUpperCase()})}/></label><label>연락처<input value={entityModal.phone||''} onChange={e=>setEntityModal({...entityModal,phone:e.target.value})}/></label><label>생년월일<input type="date" value={entityModal.birth_date||''} onChange={e=>setEntityModal({...entityModal,birth_date:e.target.value})}/></label><label>성별<select value={entityModal.gender||''} onChange={e=>setEntityModal({...entityModal,gender:e.target.value})}><option value="">미지정</option><option value="M">남</option><option value="F">여</option></select></label><label>여권번호<input value={entityModal.passport_no||''} onChange={e=>setEntityModal({...entityModal,passport_no:e.target.value.toUpperCase()})}/></label><label>여권만료일<input type="date" value={entityModal.passport_expiry||''} onChange={e=>setEntityModal({...entityModal,passport_expiry:e.target.value})}/></label><label className="checkField"><span>여권 검증완료</span><input type="checkbox" checked={!!entityModal.passport_checked} onChange={e=>setEntityModal({...entityModal,passport_checked:e.target.checked})}/></label><label className="span2">비고<textarea rows="3" value={entityModal.note||''} onChange={e=>setEntityModal({...entityModal,note:e.target.value})}/></label></div>}
      {entityModal.type==='air'&&<div className="modalGrid"><label>구간<select value={entityModal.segment_role||'international'} onChange={e=>setEntityModal({...entityModal,segment_role:e.target.value})}><option value="international">국제선</option><option value="domestic">국내선</option><option value="intermediate">중간항공</option></select></label><label>항공사<input value={entityModal.airline||''} onChange={e=>setEntityModal({...entityModal,airline:e.target.value})}/></label><label>편명<input value={entityModal.flight_no||''} onChange={e=>setEntityModal({...entityModal,flight_no:e.target.value.toUpperCase()})}/></label><label>PNR<input value={entityModal.pnr||''} onChange={e=>setEntityModal({...entityModal,pnr:e.target.value.toUpperCase()})}/></label><label>출발공항<input value={entityModal.departure_airport||''} onChange={e=>setEntityModal({...entityModal,departure_airport:e.target.value.toUpperCase()})}/></label><label>도착공항<input value={entityModal.arrival_airport||''} onChange={e=>setEntityModal({...entityModal,arrival_airport:e.target.value.toUpperCase()})}/></label><label>출발일시<input type="datetime-local" value={entityModal.departure_at||''} onChange={e=>setEntityModal({...entityModal,departure_at:e.target.value})}/></label><label>도착일시<input type="datetime-local" value={entityModal.arrival_at||''} onChange={e=>setEntityModal({...entityModal,arrival_at:e.target.value})}/></label><label>발권마감<input type="datetime-local" value={entityModal.ticketing_deadline||''} onChange={e=>setEntityModal({...entityModal,ticketing_deadline:e.target.value})}/></label><label>발권처<input value={entityModal.issuer||''} onChange={e=>setEntityModal({...entityModal,issuer:e.target.value})}/></label><label>금액(원)<input type="number" min="0" value={entityModal.amount_krw||''} onChange={e=>setEntityModal({...entityModal,amount_krw:e.target.value})}/></label><label>상태<select value={entityModal.status||'confirmed'} onChange={e=>setEntityModal({...entityModal,status:e.target.value})}><option value="requested">요청</option><option value="confirmed">확정</option><option value="cancelled">취소</option></select></label><label className="checkField span2"><span>발권 완료</span><input type="checkbox" checked={!!entityModal.ticketed} onChange={e=>setEntityModal({...entityModal,ticketed:e.target.checked})}/></label><label className="span2">비고<textarea rows="3" value={entityModal.note||''} onChange={e=>setEntityModal({...entityModal,note:e.target.value})}/></label></div>}
      {entityModal.type==='hotel'&&<div className="modalGrid"><label className="span2">호텔명<input value={entityModal.hotel_name||''} onChange={e=>setEntityModal({...entityModal,hotel_name:e.target.value})}/></label><label>객실타입<input value={entityModal.room_type||''} onChange={e=>setEntityModal({...entityModal,room_type:e.target.value})}/></label><label>밀플랜<input value={entityModal.meal_plan||''} onChange={e=>setEntityModal({...entityModal,meal_plan:e.target.value})} placeholder="BB / HB / FB / AI"/></label><label>체크인<input type="date" value={entityModal.check_in||''} onChange={e=>setEntityModal({...entityModal,check_in:e.target.value})}/></label><label>체크아웃<input type="date" value={entityModal.check_out||''} onChange={e=>setEntityModal({...entityModal,check_out:e.target.value})}/></label><label>객실 수<input type="number" min="1" value={entityModal.rooms||1} onChange={e=>setEntityModal({...entityModal,rooms:e.target.value})}/></label><label>확정번호<input value={entityModal.confirmation_no||''} onChange={e=>setEntityModal({...entityModal,confirmation_no:e.target.value})}/></label><label>공급처<input value={entityModal.supplier_name||''} onChange={e=>setEntityModal({...entityModal,supplier_name:e.target.value})}/></label><label>무료취소 마감<input type="date" value={entityModal.free_cancel_deadline||''} onChange={e=>setEntityModal({...entityModal,free_cancel_deadline:e.target.value})}/></label><label>금액(원)<input type="number" min="0" value={entityModal.amount_krw||''} onChange={e=>setEntityModal({...entityModal,amount_krw:e.target.value})}/></label><label>상태<select value={entityModal.status||'confirmed'} onChange={e=>setEntityModal({...entityModal,status:e.target.value})}><option value="requested">요청</option><option value="confirmed">확정</option><option value="cancelled">취소</option></select></label><label className="checkField span2"><span>허니문 베네핏 요청</span><input type="checkbox" checked={!!entityModal.honeymoon_benefit_requested} onChange={e=>setEntityModal({...entityModal,honeymoon_benefit_requested:e.target.checked})}/></label><label className="span2">비고<textarea rows="3" value={entityModal.note||''} onChange={e=>setEntityModal({...entityModal,note:e.target.value})}/></label></div>}
      {entityModal.type==='document'&&<div className="modalGrid"><label>문서종류<select value={entityModal.document_type||'itinerary'} onChange={e=>setEntityModal({...entityModal,document_type:e.target.value})}><option value="contract">계약서</option><option value="voucher">바우처</option><option value="itinerary">일정표</option><option value="invoice">청구서</option><option value="passport">여권</option><option value="ticket">항공권</option><option value="other">기타</option></select></label><label>제목<input value={entityModal.title||''} onChange={e=>setEntityModal({...entityModal,title:e.target.value})}/></label><label className="span2">파일 URL<input value={entityModal.file_url||''} onChange={e=>setEntityModal({...entityModal,file_url:e.target.value})} placeholder="https://..."/></label><label className="checkField"><span>고객 전달완료</span><input type="checkbox" checked={!!entityModal.delivered} onChange={e=>setEntityModal({...entityModal,delivered:e.target.checked,delivered_at:e.target.checked?(entityModal.delivered_at||toLocalDateTime(new Date())):''})}/></label><label>전달일시<input type="datetime-local" disabled={!entityModal.delivered} value={entityModal.delivered_at||''} onChange={e=>setEntityModal({...entityModal,delivered_at:e.target.value})}/></label><label className="span2">비고<textarea rows="3" value={entityModal.note||''} onChange={e=>setEntityModal({...entityModal,note:e.target.value})}/></label></div>}
      <div className="modalActions"><button className="secondary" onClick={()=>closeEditableModal('entity',entityModal)}>닫기</button><button className="primary" onClick={saveOperationalEntity}><Save size={16}/> 저장</button></div>
    </div></div>}

    {profitReportOpen&&<div className="modalBack printReportBack"><div className="modalBox profitReportModal printProfitReport"><button className="close reportNoPrint" onClick={()=>setProfitReportOpen(false)}><X/></button>
      <div className="profitReportHeader"><div><small>AIL AIR TOUR · PROFIT REPORT</small><h1>{reportScopeLabel()} 수익 보고서</h1><p>{reportPeriodLabel()} · 통계 컨트롤 패널과 동일한 범위</p></div><div className="profitReportActions reportNoPrint"><button className="secondary" onClick={()=>setProfitReportOpen(false)}>닫기</button>{has(member,'settlement_print')&&<button className="primary" onClick={printProfitReport}>A4 인쇄</button>}</div></div>
      <div className="reportMeta"><span>보고 범위 <b>{reportScopeLabel()}</b></span><span>기준 기간 <b>{reportPeriodLabel()}</b></span><span>예약 <b>{profitReport.count}건 / {profitReport.people}명</b></span><span>출력일 <b>{new Date().toLocaleDateString('ko-KR')}</b></span></div>
      <div className="reportKpiGrid"><div><span>최종 매출</span><b>{won(profitReport.finalSale)}</b><small>계약매출 {won(profitReport.contractSale)}{profitReport.fxAdjustment?` · 환율조정 ${won(profitReport.fxAdjustment)}`:''}</small></div><div><span>누적 입금</span><b>{won(profitReport.paid)}</b><small>미수·초과 {won(profitReport.balance)}</small></div><div><span>총 원가</span><b>{won(profitReport.expense)}</b><small>등록된 예약 원가 기준</small></div><div className="reportProfitKpi"><span>예상 순이익</span><b>{won(profitReport.profit)}</b><small>이익률 {profitReport.margin.toFixed(1)}%</small></div></div>
      <section className="reportSection"><div className="reportSectionHead"><h3>원가 구성</h3><span>총 {won(profitReport.expense)}</span></div><div className="reportCostGrid"><div><span>항공 원가</span><b>{won(profitReport.airCost)}</b></div><div><span>호텔 원가</span><b>{won(profitReport.hotelCost)}</b></div><div><span>랜드 원가</span><b>{won(profitReport.landCost)}</b></div><div className={profitReport.otherCost>0?'reportWarn':''}><span>기타·미분류</span><b>{won(profitReport.otherCost)}</b></div></div></section>
      <section className="reportSection"><div className="reportSectionHead"><h3>예약별 수익 현황</h3><span>{profitReport.rows.length}건</span></div><div className="reportTableWrap"><table className="reportTable"><thead><tr><th>예약번호</th><th>고객</th><th>상품/지역</th><th>출발일</th><th>인원</th><th>최종매출</th><th>입금</th><th>원가</th><th>예상순이익</th><th>이익률</th></tr></thead><tbody>{profitReport.rows.map(r=>{const sale=num(r.final_sale_amount||r.sale_amount),expense=num(expMap[r.id]),profit=sale-expense,margin=sale?profit/sale*100:0;return <tr key={`report-${r.id}`}><td>{r.reservation_code}</td><td><b>{r.customer_name}</b></td><td>{r.title||r.destination||'-'}</td><td>{ymd(r.departure_date)}</td><td>{num(r.traveler_count)}명</td><td>{won(sale)}</td><td>{won(payMap[r.id])}</td><td>{won(expense)}</td><td className={profit<0?'reportLoss':'reportGain'}>{won(profit)}</td><td>{margin.toFixed(1)}%</td></tr>})}</tbody></table>{profitReport.rows.length===0&&<div className="emptyState">선택 기간에 해당하는 예약이 없습니다.</div>}</div></section>
      <div className="reportFoot"><span>※ 예상 순이익 = 최종 매출 − 등록 원가</span><span>※ 미분류 원가가 있는 경우 실제 수익 분석 전에 재분류 확인이 필요합니다.</span></div>
    </div></div>}

    {qualityModal&&<div className="modalBack"><div className="modalBox qualityIssueModal"><button className="close" onClick={()=>setQualityModal(null)}><X/></button><div className="qualityModalHead"><div><small>DATA QUALITY CHECK</small><h2>{qualityModal.title}</h2><p>문제 내용을 확인하고 이 화면에서 바로 수정하거나 관련 상세 탭으로 이동할 수 있습니다.</p></div><span className="qualityCountBadge">{qualityModal.items.length}건</span></div>
      <div className="qualityIssueList">{qualityModal.items.map(r=><div className="qualityIssueRow qualityIssueActionRow" key={r.id}>
        <button type="button" className="qualityIssueOpen" onClick={()=>openQualityReservation(r,qualityModal.tab)}><div className="qualityIssueMain"><b>{r.customer_name||'고객명 미등록'}</b><small>{r.reservation_code} · {r.destination||r.title||'-'} · 출발 {ymd(r.departure_date)}</small></div>
        <div className="qualityIssueAmount">{qualityModal.type==='zero_sale_paid'&&<><span>매출 {won(r.sale_amount)}</span><strong>입금 {won(r.paid)}</strong></>}{qualityModal.type==='overpayment'&&<><span>매출 {won(r.sale_amount)} · 입금 {won(r.paid)}</span><strong>초과 {won(r.overpaid)}</strong></>}{qualityModal.type==='uncategorized'&&<><span>기타·미분류 원가</span><strong>{won(r.uncategorized_amount)}</strong></>}<em>상세 보기 →</em></div></button>
        <div className="qualityQuickActions">{qualityModal.type==='uncategorized'?<button className="primary mini" disabled={!has(member,'expense_manage')} onClick={()=>openExpenseReclass(r)}>재분류</button>:<><button className="primary mini" disabled={!has(member,'reservation_edit')} onClick={()=>openQualityReservationEdit(r)}>매출 수정</button><button className="secondary mini" onClick={()=>openQualityReservation(r,'payments')}>입금 확인</button></>}</div>
      </div>)}</div>
      <div className="modalActions"><button className="secondary" onClick={()=>setQualityModal(null)}>닫기</button></div>
    </div></div>}

    {qualityExpenseModal&&<div className="modalBack"><div className={`modalBox qualityReclassModal ${isModalDirty('qualityExpense',qualityExpenseModal)?'hasUnsaved':''}`}><button className="close" onClick={()=>closeEditableModal('qualityExpense',qualityExpenseModal)}><X/></button><div className="qualityModalHead"><div><small>COST RECLASSIFICATION</small><h2>기타·미분류 원가 재분류</h2><p>{qualityExpenseModal.reservation.customer_name} · {qualityExpenseModal.reservation.reservation_code}</p></div><span className="qualityCountBadge">{qualityExpenseModal.items.length}건</span></div>
      <div className="reclassList">{qualityExpenseModal.items.map((e,i)=><div className="reclassRow" key={e.id}><div><b>{e.vendor_name||'거래처 미등록'}</b><small>{ymd(e.paid_date||e.due_date)} · {e.note||'비고 없음'}</small></div><strong>{won(e.amount_krw)}</strong><select value={e.new_expense_type||'other'} onChange={ev=>setQualityExpenseModal({...qualityExpenseModal,items:qualityExpenseModal.items.map((x,ix)=>ix===i?{...x,new_expense_type:ev.target.value}:x)})}><option value="other">기타·미분류</option><option value="international_air">국제선 항공</option><option value="domestic_air">국내선/현지 항공</option><option value="hotel">호텔</option><option value="land">랜드/지상비</option></select></div>)}</div>
      <div className="qualityReclassNotice">분류 변경은 금액을 수정하지 않고 <b>원가 유형만 변경</b>합니다. 저장 후 데이터 점검 및 원가 요약에 즉시 반영됩니다.</div>
      <div className="modalActions"><button className="secondary" onClick={()=>closeEditableModal('qualityExpense',qualityExpenseModal)}>닫기</button><button className="primary" disabled={!has(member,'expense_manage')} onClick={saveExpenseReclass}><Save size={16}/> 재분류 저장</button></div>
    </div></div>}

    {paymentModal&&<div className="modalBack"><div className={`modalBox paymentQuickModal ${isModalDirty('payment',paymentModal)?'hasUnsaved':''}`}><button className="close" onClick={()=>closeEditableModal('payment',paymentModal)}><X/></button><h2>{paymentModal.mode==='edit'?'입금·환불 내역 수정':'고객 잔금 입금 등록'}</h2><p className="modalLead">{paymentModal.customer_name} · {paymentModal.reservation_code}</p><div className="modalGrid"><label>일자<input type="date" value={paymentModal.payment_date||''} onChange={e=>setPaymentModal({...paymentModal,payment_date:e.target.value})}/></label><label>구분<select value={paymentModal.payment_type||'balance'} onChange={e=>setPaymentModal({...paymentModal,payment_type:e.target.value})}><option value="deposit">계약금</option><option value="interim">중도금</option><option value="balance">잔금</option><option value="additional">추가입금</option><option value="refund">환불</option></select></label><label>입금방법<select value={paymentModal.payment_method||'transfer'} onChange={e=>setPaymentModal({...paymentModal,payment_method:e.target.value})}><option value="transfer">계좌이체</option><option value="card">카드</option><option value="cash">현금</option><option value="mixed">복합</option></select></label><label>금액<input type="number" min="0" value={paymentModal.amount||''} onChange={e=>setPaymentModal({...paymentModal,amount:e.target.value})}/></label><label className="span2">비고<textarea rows="3" value={paymentModal.note||''} onChange={e=>setPaymentModal({...paymentModal,note:e.target.value})}/></label></div><div className="paymentSafety"><b>{paymentModal.payment_type==='refund'?'환불 처리 안내':'잔금 완료 기준'}</b><span>{paymentModal.payment_type==='refund'?'환불 금액은 누적 입금액에서 차감됩니다.':'실제 입금내역을 저장합니다. 저장 후 누적입금액이 최종 판매금액에 도달해야 잔금 업무가 자동으로 사라집니다.'}</span></div><div className="modalActions"><button className="secondary" onClick={()=>closeEditableModal('payment',paymentModal)}>닫기</button><button className="primary" onClick={saveBalancePayment}><Save size={16}/> {paymentModal.mode==='edit'?'수정 저장':'입금 저장'}</button></div></div></div>}

    {modal&&<div className="modalBack"><div className={`modalBox reservationForm ${isModalDirty('reservation',modal)?'hasUnsaved':''}`}><div className="reservationFormHeader"><button className="close" onClick={()=>closeEditableModal('reservation',modal)}><X/></button><h2>{modal.mode==='edit'?'예약 수정':'새 예약 등록'}</h2></div>
      <div className="reservationFormBody"><div className="modalGrid">
        <label>예약번호<input value={modal.reservation_code||''} onChange={e=>setModal({...modal,reservation_code:e.target.value})}/></label>
        <label>상품구분<select value={modal.product_type||'honeymoon'} onChange={e=>setModal({...modal,product_type:e.target.value})}><option value="honeymoon">허니문</option><option value="package">해외패키지</option><option value="air">해외항공권</option><option value="group">국내·외 단체</option></select></label>
        <label>고객명<input value={modal.customer_name||''} onChange={e=>setModal({...modal,customer_name:e.target.value})}/></label>
        <label>연락처<input value={modal.customer_phone||''} onChange={e=>setModal({...modal,customer_phone:e.target.value})}/></label>
        <label className="span2">상품명<input value={modal.title||''} onChange={e=>setModal({...modal,title:e.target.value})}/></label>
        <label>지역<input value={modal.destination||''} onChange={e=>setModal({...modal,destination:e.target.value})}/></label>
        <label>협력사<input value={modal.partner_name||''} onChange={e=>setModal({...modal,partner_name:e.target.value})}/></label>
        <label>담당자<input value={modal.manager_name||''} onChange={e=>setModal({...modal,manager_name:e.target.value})}/></label>
        <label>인원<input type="number" min="1" value={modal.traveler_count||1} onChange={e=>setModal({...modal,traveler_count:e.target.value})}/></label>
        <label>출발일<input type="date" value={modal.departure_date||''} onChange={e=>setModal({...modal,departure_date:e.target.value})}/></label>
        <label>도착일<input type="date" value={modal.return_date||''} onChange={e=>setModal({...modal,return_date:e.target.value})}/></label>
        <label className="checkField"><span>여권 사본 수령</span><input type="checkbox" checked={!!modal.passport_copy_received} onChange={e=>setModal({...modal,passport_copy_received:e.target.checked,passport_copy_received_at:e.target.checked?(modal.passport_copy_received_at||new Date().toISOString().slice(0,10)):''})}/><small>출발일 기준 D-30까지 필수 확인</small></label>
        <label>여권 사본 수령일<input type="date" disabled={!modal.passport_copy_received} value={modal.passport_copy_received_at||''} onChange={e=>setModal({...modal,passport_copy_received_at:e.target.value})}/></label>
        {modal.product_type==='honeymoon'&&<>
          <div className="span2 opsNoticeBox"><b>유럽 허니문 · 중간 이동구간 항공</b><small>유럽 내 도시 간 항공권처럼 발권 후 취소·환불이 어려운 구간이 있는 경우 체크합니다.</small></div>
          <label className="checkField span2"><span>중간 이동구간 항공 있음</span><input type="checkbox" checked={!!modal.intermediate_air_segment_exists} onChange={e=>setModal({...modal,intermediate_air_segment_exists:e.target.checked,intermediate_air_deposit_paid:e.target.checked?modal.intermediate_air_deposit_paid:false,intermediate_air_deposit_paid_at:e.target.checked?modal.intermediate_air_deposit_paid_at:'',intermediate_air_nonrefundable_notice_done:e.target.checked?modal.intermediate_air_nonrefundable_notice_done:false,intermediate_air_nonrefundable_notice_at:e.target.checked?modal.intermediate_air_nonrefundable_notice_at:''})}/><small>해당 구간이 있는 경우에만 아래 중도금·환불불가 안내를 관리합니다.</small></label>
          {modal.intermediate_air_segment_exists&&<>
            <label className="checkField"><span>중간항공 중도금 결제 완료</span><input type="checkbox" checked={!!modal.intermediate_air_deposit_paid} onChange={e=>setModal({...modal,intermediate_air_deposit_paid:e.target.checked,intermediate_air_deposit_paid_at:e.target.checked?(modal.intermediate_air_deposit_paid_at||new Date().toISOString().slice(0,10)):''})}/><small>중간 이동구간 항공권 발권용 중도금 결제 확인</small></label>
            <label>중도금 결제일<input type="date" disabled={!modal.intermediate_air_deposit_paid} value={modal.intermediate_air_deposit_paid_at||''} onChange={e=>setModal({...modal,intermediate_air_deposit_paid_at:e.target.value})}/></label>
            <label className="checkField"><span>중도금 환불 불가 안내 완료</span><input type="checkbox" checked={!!modal.intermediate_air_nonrefundable_notice_done} onChange={e=>setModal({...modal,intermediate_air_nonrefundable_notice_done:e.target.checked,intermediate_air_nonrefundable_notice_at:e.target.checked?(modal.intermediate_air_nonrefundable_notice_at||new Date().toISOString().slice(0,10)):''})}/><small>고객에게 해당 중도금은 중간항공 발권 후 환불 불가임을 안내했는지 확인</small></label>
            <label>환불불가 안내일<input type="date" disabled={!modal.intermediate_air_nonrefundable_notice_done} value={modal.intermediate_air_nonrefundable_notice_at||''} onChange={e=>setModal({...modal,intermediate_air_nonrefundable_notice_at:e.target.value})}/></label>
          </>}
        </>}
        <div className="span2 opsNoticeBox"><b>잔금 환율 변동 정산</b><small>계약 당시 환율과 잔금 결제 시점 환율의 차이만 환율 조정액으로 반영합니다. 적용 통화는 THB · USD · EUR 중 선택합니다.</small></div>
        <label>환율 적용 통화<select value={modal.fx_currency||''} onChange={e=>setModal({...modal,fx_currency:e.target.value,fx_notice_done:e.target.value?modal.fx_notice_done:false,fx_notice_at:e.target.value?modal.fx_notice_at:''})}><option value="">환율 미적용</option><option value="THB">태국 바트 (THB)</option><option value="USD">미국 달러 (USD)</option><option value="EUR">유럽 유로 (EUR)</option></select></label>
        <label>1인 외화 적용금액<input type="number" min="0" step="0.01" disabled={!modal.fx_currency} value={modal.fx_foreign_amount_per_person||''} onChange={e=>setModal({...modal,fx_foreign_amount_per_person:e.target.value})} placeholder="예: 1200"/></label>
        <label>계약 기준환율<input type="number" min="0" step="0.01" disabled={!modal.fx_currency} value={modal.contract_exchange_rate||''} onChange={e=>setModal({...modal,contract_exchange_rate:e.target.value})} placeholder="1통화 = 원"/></label>
        <label>잔금 적용환율<input type="number" min="0" step="0.01" disabled={!modal.fx_currency} value={modal.balance_exchange_rate||''} onChange={e=>setModal({...modal,balance_exchange_rate:e.target.value})} placeholder="잔금 결제 시 환율"/></label>
        {modal.fx_currency&&<div className="span2 fxPreview">
          <div><span>통화</span><b>{fxLabel[modal.fx_currency]}</b></div>
          <div><span>환율 조정액</span><b>{won(fxAdjustment(modal))}</b></div>
          <div><span>계약 총액</span><b>{won(modal.sale_amount)}</b></div>
          <div><span>환율 반영 최종금액</span><b>{won(num(modal.sale_amount)+fxAdjustment(modal))}</b></div>
        </div>}
        <label className="checkField"><span>환율 변동에 따른 잔금 변동 안내 완료</span><input type="checkbox" disabled={!modal.fx_currency} checked={!!modal.fx_notice_done} onChange={e=>setModal({...modal,fx_notice_done:e.target.checked,fx_notice_at:e.target.checked?(modal.fx_notice_at||new Date().toISOString().slice(0,10)):''})}/><small>고객에게 잔금 결제 시 환율에 따라 최종 잔금이 증감될 수 있음을 안내</small></label>
        <label>환율 변동 안내일<input type="date" disabled={!modal.fx_currency||!modal.fx_notice_done} value={modal.fx_notice_at||''} onChange={e=>setModal({...modal,fx_notice_at:e.target.value})}/></label>
        <label>총 매출<input type="number" min="0" value={modal.sale_amount||0} onChange={e=>setModal({...modal,sale_amount:e.target.value})}/></label>
        <label>예약상태<select value={modal.status||'confirmed'} onChange={e=>setModal({...modal,status:e.target.value})}><option value="confirmed">확정</option><option value="ticketed">발권</option><option value="completed">완료</option><option value="cancelled">취소</option></select></label>
        <label className="span2">비고<textarea rows="3" value={modal.memo||''} onChange={e=>setModal({...modal,memo:e.target.value})}/></label>
      </div></div>
      <div className="modalActions reservationFormActions"><button className="secondary" onClick={()=>closeEditableModal('reservation',modal)}>닫기</button><button className="primary" onClick={saveReservation}><Save size={16}/> 저장</button></div>
    </div></div>}
  </div>
}

function Calendar({rows,date,setDate}){
  const y=date.getFullYear(),m=date.getMonth()
  const start=new Date(y,m,1), end=new Date(y,m+1,0)
  const prev=()=>setDate(new Date(y,m-1,1)), next=()=>setDate(new Date(y,m+1,1))
  const cells=[]
  for(let i=0;i<start.getDay();i++)cells.push(null)
  for(let d=1;d<=end.getDate();d++)cells.push(d)
  while(cells.length%7)cells.push(null)
  const rr=rows.filter(r=>{const d=new Date(r.departure_date);return d.getFullYear()===y&&d.getMonth()===m})
  return <section className="panel calendarPanel">
    <div className="calendarStats"><div><span>{m+1}월 출발</span><b>{rr.length}팀</b></div><div><span>출발 인원</span><b>{rr.reduce((a,r)=>a+num(r.traveler_count),0)}명</b></div><div><span>확인 필요</span><b>{rr.filter(r=>!r.final_check_done).length}건</b></div><div><span>여권 D-30 미수령</span><b>{rr.filter(r=>{const d=dayDiff(new Date(),r.departure_date);return !r.passport_copy_received&&d!==null&&d<=30&&d>=0}).length}건</b></div><div><span>등록 담당자</span><b>{new Set(rr.map(r=>r.manager_name).filter(Boolean)).size}명</b></div></div>
    <div className="calHead"><button onClick={prev}><ChevronLeft/></button><h2>{y}년 {m+1}월</h2><button onClick={next}><ChevronRight/></button></div>
    <div className="week">{['일','월','화','수','목','금','토'].map(x=><b>{x}</b>)}</div>
    <div className="calendar">{cells.map((d,i)=><div className="day" key={i}>{d&&<><span>{d}</span>{rr.filter(r=>new Date(r.departure_date).getDate()===d).map(r=><div className="event" key={r.id}><b>{r.customer_name}</b><small>{TYPE[r.product_type]||r.product_type} · {r.traveler_count}명</small></div>)}</>}</div>)}</div>
  </section>
}
