import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Save,
  X,
  LogIn,
  LogOut,
  UserRound,
  LoaderCircle,
  LockKeyhole,
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
            <input
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading}
            />
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

export default function App() {
  const organizationId = import.meta.env.VITE_ORGANIZATION_ID
  const [session, setSession] = useState(null)
  const [currentMember, setCurrentMember] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(null)
  const [message, setMessage] = useState('')

  const canManageStaff =
    currentMember?.role === 'master' ||
    currentMember?.permissions?.staff_manage === true

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
    if (currentMember && canManageStaff) loadMembers()
    if (currentMember && !canManageStaff) setMembers([])
  }, [currentMember?.user_id, canManageStaff])

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

  async function loadMembers() {
    if (!organizationId || !canManageStaff) return

    setMembersLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('ops_members')
      .select('organization_id,user_id,email,display_name,role,active,permissions,created_at')
      .eq('organization_id', organizationId)
      .order('created_at')

    if (error) setMessage(`직원 목록 조회 오류: ${error.message}`)
    else setMembers(data ?? [])

    setMembersLoading(false)
  }

  function openEdit(member) {
    if (!canManageStaff || member.role === 'master') return

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
    if (!selected || !form || !canManageStaff) return

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

  const activeCount = useMemo(
    () => members.filter(member => member.active).length,
    [members]
  )

  const managerCount = useMemo(
    () => members.filter(member => member.role === 'manager').length,
    [members]
  )

  if (authLoading) {
    return (
      <div className="boot-screen">
        <LoaderCircle className="spin" size={30}/>
        <span>시스템 확인 중...</span>
      </div>
    )
  }

  if (!session) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        loading={loginLoading}
        error={loginError}
      />
    )
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
          <button><LayoutDashboard size={18}/> 대시보드</button>
          {canManageStaff && (
            <button className="active"><Users size={18}/> 직원 관리</button>
          )}
        </nav>

        <div className="sidebar-user">
          <div className="avatar"><UserRound size={17}/></div>
          <div className="sidebar-user-copy">
            <strong>{currentMember.display_name || currentMember.email}</strong>
            <span>{roleLabel[currentMember.role] || currentMember.role}</span>
          </div>
          <button className="logout-mini" onClick={handleLogout} title="로그아웃">
            <LogOut size={17}/>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <h1>{canManageStaff ? '직원 관리' : '대시보드'}</h1>
            <p>
              {canManageStaff
                ? '등록 직원의 역할, 상태, 세부 권한을 관리합니다.'
                : '내 계정에 허용된 운영 기능만 사용할 수 있습니다.'}
            </p>
          </div>
          <div className={`account-badge ${currentMember.role}`}>
            <ShieldCheck size={16}/>
            {roleLabel[currentMember.role] || currentMember.role}
          </div>
        </header>

        {!canManageStaff ? (
          <section className="panel no-access-panel">
            <ShieldCheck size={30}/>
            <h2>직원 관리 권한이 없습니다.</h2>
            <p>MASTER 또는 직원관리 권한을 가진 MANAGER만 직원 목록과 권한을 관리할 수 있습니다.</p>
          </section>
        ) : (
          <>
            <section className="kpis">
              <div className="kpi"><span>전체 직원</span><strong>{members.length}</strong></div>
              <div className="kpi"><span>활성 직원</span><strong>{activeCount}</strong></div>
              <div className="kpi"><span>MANAGER</span><strong>{managerCount}</strong></div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>등록 직원</h2>
                  <p>MASTER 계정은 보호되며 일반 직원 계정만 수정할 수 있습니다.</p>
                </div>
                <button onClick={loadMembers} disabled={membersLoading}>
                  {membersLoading ? '불러오는 중...' : '새로고침'}
                </button>
              </div>

              {message && <div className="message">{message}</div>}

              {membersLoading ? (
                <div className="empty">직원 정보를 불러오는 중...</div>
              ) : (
                <div className="staff-list">
                  {members.map(member => (
                    <div className="staff-row" key={member.user_id}>
                      <div className="staff-person">
                        <div className="avatar small"><UserRound size={16}/></div>
                        <div>
                          <strong>{member.display_name || '이름 없음'}</strong>
                          <span>{member.email}</span>
                        </div>
                      </div>

                      <div className="staff-meta">
                        <span className={`role ${member.role}`}>
                          {roleLabel[member.role] || member.role}
                        </span>
                        <span className={member.active ? 'status on' : 'status off'}>
                          {member.active ? '활성' : '비활성'}
                        </span>
                        <button
                          onClick={() => openEdit(member)}
                          disabled={member.role === 'master'}
                          title={member.role === 'master' ? 'MASTER 계정은 보호됩니다.' : ''}
                        >
                          {member.role === 'master' ? '보호됨' : '정보 수정'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {selected && form && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-head">
                <div>
                  <h2>직원 정보 수정</h2>
                  <p>{selected.email}</p>
                </div>
                <button className="icon-btn" onClick={() => setSelected(null)}>
                  <X size={20}/>
                </button>
              </div>

              <label>
                이름
                <input
                  value={form.display_name}
                  onChange={e => setForm({...form, display_name: e.target.value})}
                />
              </label>

              <label>
                역할
                <select
                  value={form.role}
                  onChange={e => setForm({...form, role: e.target.value})}
                >
                  <option value="manager">MANAGER</option>
                  <option value="staff">STAFF</option>
                  <option value="viewer">VIEWER</option>
                </select>
              </label>

              <label className="toggle-line">
                <span>계정 활성</span>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm({...form, active: e.target.checked})}
                />
              </label>

              <div className="permissions">
                <h3>접근 권한</h3>
                <div className="permission-grid">
                  {Object.entries(permissionLabels).map(([key, label]) => (
                    <label className="check" key={key}>
                      <input
                        type="checkbox"
                        checked={!!form.permissions[key]}
                        onChange={e =>
                          setForm({
                            ...form,
                            permissions: {
                              ...form.permissions,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {message && <div className="message">{message}</div>}

              <div className="modal-actions">
                <button className="secondary" onClick={() => setSelected(null)}>취소</button>
                <button className="primary" onClick={saveMember}>
                  <Save size={16}/> 변경사항 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
