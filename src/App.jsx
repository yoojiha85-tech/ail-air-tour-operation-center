
import { useEffect, useMemo, useState } from 'react'
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

const NAV = [
  ['dashboard','▦ 통합 대시보드','dashboard_view'],
  ['calendar','▣ 출발 캘린더','calendar_view'],
  ['honeymoon','허니문','reservation_view'],
  ['package','해외패키지','reservation_view'],
  ['air','해외항공권','reservation_view'],
  ['group','국내·외 단체','reservation_view'],
  ['airvi','✈ 2026년 항공 발권 VI','air_vi_view'],
  ['staff','⚙ 직원·권한 관리','staff_manage'],
]

const TYPE = {honeymoon:'허니문',package:'해외패키지',air:'해외항공권',group:'국내·외 단체'}
const num=v=>Number(v||0)
const won=v=>`${num(v).toLocaleString('ko-KR')}원`
const ymd=d=>d?String(d).slice(0,10):'-'
const monthLabel=m=>`${m}월`
const methodLabel={transfer:'입금',card:'카드',cash:'현금',mixed:'혼합'}
const roleLabel={master:'마스터',manager:'관리자',staff:'직원',viewer:'조회전용'}
const has=(m,k)=>m?.role==='master'||m?.permissions?.[k]===true

function Login(){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  async function submit(e){
    e.preventDefault(); setError('')
    const {error}=await supabase.auth.signInWithPassword({email,password})
    if(error)setError('이메일 또는 비밀번호를 확인해 주세요.')
  }
  return <div className="login"><form onSubmit={submit}>
    <h1>아일항공여행사</h1><p>통합 예약관리</p>
    <input placeholder="이메일" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
    <input placeholder="비밀번호" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>
    {error&&<div className="error">{error}</div>}
    <button>로그인</button>
  </form></div>
}

export default function App(){
  const [session,setSession]=useState(null)
  const [member,setMember]=useState(null)
  const [page,setPage]=useState('dashboard')
  const [rows,setRows]=useState([])
  const [payments,setPayments]=useState([])
  const [expenses,setExpenses]=useState([])
  const [members,setMembers]=useState([])
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

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>data.subscription.unsubscribe()
  },[])
  useEffect(()=>{ if(session?.user?.id) loadMember() },[session?.user?.id])
  useEffect(()=>{ if(member) loadAll() },[member?.user_id])

  async function loadMember(){
    const {data,error}=await supabase.from('ops_members').select('*')
      .eq('organization_id',ORG).eq('user_id',session.user.id).maybeSingle()
    if(error||!data){setError('등록된 직원 권한을 확인할 수 없습니다.');return}
    setMember(data)
  }
  async function loadAll(){
    setLoading(true);setError('')
    const [r,p,e,m,v]=await Promise.all([
      supabase.from('ops_reservations').select('*').eq('organization_id',ORG).order('departure_date',{ascending:true}),
      supabase.from('ops_payments').select('*').eq('organization_id',ORG),
      supabase.from('ops_expenses').select('*').eq('organization_id',ORG),
      supabase.from('ops_members').select('*').eq('organization_id',ORG).order('created_at'),
      supabase.from('ops_air_vi_monthly').select('*').eq('organization_id',ORG).order('year').order('month')
    ])
    const er=r.error||p.error||e.error||m.error||v.error
    if(er)setError(er.message)
    setRows(r.data||[]);setPayments(p.data||[]);setExpenses(e.data||[]);setMembers(m.data||[]);setVi(v.data||[])
    setLoading(false)
  }

  const payMap=useMemo(()=>Object.fromEntries(rows.map(r=>[r.id,payments.filter(x=>x.reservation_id===r.id).reduce((a,b)=>a+num(b.amount),0)])),[rows,payments])
  const expMap=useMemo(()=>Object.fromEntries(rows.map(r=>[r.id,expenses.filter(x=>x.reservation_id===r.id).reduce((a,b)=>a+num(b.amount_krw),0)])),[rows,expenses])

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

  const periodRows=rows.filter(inPeriod)

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
    const periodPayments=payments.filter(p=>matchesPeriodDate(p.payment_date))
    const periodExpenses=expenses.filter(e=>matchesPeriodDate(e.paid_date || e.due_date))
    const paid=periodPayments.reduce((a,p)=>a+num(p.amount),0)
    const expense=periodExpenses.reduce((a,e)=>a+num(e.amount_krw),0)
    return {
      paid, expense,
      paymentCount:periodPayments.length,
      expenseCount:periodExpenses.length
    }
  },[payments,expenses,year,period,periodValue])

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
      status:'confirmed', settlement_status:'unsettled', sale_amount:0, memo:''
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
      memo:modal.memo||null
    }
    let q
    if(modal.mode==='edit'){
      q=supabase.from('ops_reservations').update(payload).eq('organization_id',ORG).eq('id',modal.id)
    }else{
      q=supabase.from('ops_reservations').insert({...payload,organization_id:ORG,created_by:session.user.id})
    }
    const {error}=await q
    if(error)return alert(error.message)
    setModal(null); await loadAll()
  }

  async function deleteReservation(r){
    if(!has(member,'reservation_delete'))return
    if(!confirm(`${r.customer_name} 예약을 삭제하시겠습니까?`))return
    const {error}=await supabase.from('ops_reservations').delete().eq('organization_id',ORG).eq('id',r.id)
    if(error)return alert(error.message)
    await loadAll()
  }

  if(loading&&!session)return <div className="center">불러오는 중...</div>
  if(!session)return <Login/>
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
            <div><small>기간별 통계</small><b>{statsMode==='reservation'?'출발일 기준 예약통계':'실제 입금일·지출일 기준 회계통계'}</b></div>
            <div className="statsMode">
              <button className={statsMode==='reservation'?'active':''} onClick={()=>setStatsMode('reservation')}>예약통계</button>
              <button className={statsMode==='accounting'?'active':''} onClick={()=>setStatsMode('accounting')}>회계통계</button>
            </div>
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
          {zeroSalePaidRows.length>0 && <div className="warnItem"><b>매출 0원인데 입금 존재</b><span>{zeroSalePaidRows.length}건 · {won(zeroSalePaidRows.reduce((a,r)=>a+r.paid,0))}</span></div>}
          {overpaymentRows.length>0 && <div className="warnItem"><b>매출보다 입금이 많은 예약</b><span>{overpaymentRows.length}건 · 초과 {won(overpaymentRows.reduce((a,r)=>a+r.overpaid,0))}</span></div>}
          {uncategorizedTotal>0 && <div className="warnItem"><b>기타·미분류 원가</b><span>{uncategorizedExpenses.length}건 · {won(uncategorizedTotal)}</span></div>}
          <details><summary>점검 대상 상세 보기</summary>
            <div className="warnDetails">
              {overpaymentRows.slice(0,20).map(r=><div key={r.id}><span>{r.customer_name} · {ymd(r.departure_date)}</span><b>초과 {won(r.overpaid)}</b></div>)}
            </div>
          </details>
        </section>}
      </>}

      {page==='dashboard'&&<>
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
          <div className="tableWrap"><table><thead><tr><th>예약번호</th><th>고객</th><th>상품/지역</th><th>출발일</th><th>인원</th><th>매출</th><th>입금</th><th>지출</th><th>순이익</th><th>관리</th></tr></thead>
          <tbody>{productRows(page).map(r=><tr key={r.id}><td>{r.reservation_code}</td><td><b>{r.customer_name}</b></td><td>{r.title||r.destination}</td><td>{ymd(r.departure_date)}</td><td>{r.traveler_count}명</td><td>{won(r.sale_amount)}</td><td>{won(payMap[r.id])}</td><td>{won(expMap[r.id])}</td><td className="profit">{won(num(r.sale_amount)-num(expMap[r.id]))}</td><td><div className="actions">{has(member,'reservation_edit')&&<button onClick={()=>openEdit(r)}>수정</button>}{has(member,'reservation_delete')&&<button className="danger" onClick={()=>deleteReservation(r)}>삭제</button>}</div></td></tr>)}</tbody></table></div>
        </section>
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
          <div className="permGrid">{Object.entries(PERM).map(([k,l])=><label key={k}><input type="checkbox" checked={!!invite.permissions[k]} onChange={e=>setInvite({...invite,permissions:{...invite.permissions,[k]:e.target.checked}})}/>{l}</label>)}</div>
          <button className="wide primary" onClick={saveInvite}>직원 사전 등록</button>
        </div>
        <div className="panel"><div className="panelHead"><div><h2>등록 직원</h2><p>가입 연결 상태와 부여 권한을 확인합니다.</p></div><span className="badge">{members.filter(m=>m.active).length}명 사용 중</span></div>
          <div>{members.map(m=><div className="staffRow" key={m.user_id}><div><b>{m.display_name||m.email}</b><span>{m.email}</span></div><div>{roleLabel[m.role]||m.role}</div></div>)}</div>
        </div>
      </section>}
    </main>

    {modal&&<div className="modalBack"><div className="modalBox reservationForm"><button className="close" onClick={()=>setModal(null)}><X/></button><h2>{modal.mode==='edit'?'예약 수정':'새 예약 등록'}</h2>
      <div className="modalGrid">
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
        <label>총 매출<input type="number" min="0" value={modal.sale_amount||0} onChange={e=>setModal({...modal,sale_amount:e.target.value})}/></label>
        <label>예약상태<select value={modal.status||'confirmed'} onChange={e=>setModal({...modal,status:e.target.value})}><option value="confirmed">확정</option><option value="ticketed">발권</option><option value="completed">완료</option><option value="cancelled">취소</option></select></label>
        <label className="span2">비고<textarea rows="3" value={modal.memo||''} onChange={e=>setModal({...modal,memo:e.target.value})}/></label>
      </div>
      <div className="modalActions"><button className="secondary" onClick={()=>setModal(null)}>취소</button><button className="primary" onClick={saveReservation}><Save size={16}/> 저장</button></div>
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
    <div className="calendarStats"><div><span>{m+1}월 출발</span><b>{rr.length}팀</b></div><div><span>출발 인원</span><b>{rr.reduce((a,r)=>a+num(r.traveler_count),0)}명</b></div><div><span>확인 필요</span><b>{rr.filter(r=>!r.final_check_done).length}건</b></div><div><span>등록 담당자</span><b>{new Set(rr.map(r=>r.manager_name).filter(Boolean)).size}명</b></div></div>
    <div className="calHead"><button onClick={prev}><ChevronLeft/></button><h2>{y}년 {m+1}월</h2><button onClick={next}><ChevronRight/></button></div>
    <div className="week">{['일','월','화','수','목','금','토'].map(x=><b>{x}</b>)}</div>
    <div className="calendar">{cells.map((d,i)=><div className="day" key={i}>{d&&<><span>{d}</span>{rr.filter(r=>new Date(r.departure_date).getDate()===d).map(r=><div className="event" key={r.id}><b>{r.customer_name}</b><small>{TYPE[r.product_type]||r.product_type} · {r.traveler_count}명</small></div>)}</>}</div>)}</div>
  </section>
}
