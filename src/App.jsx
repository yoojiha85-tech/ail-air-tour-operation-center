import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { LayoutDashboard, Users, ShieldCheck, Save, X } from 'lucide-react'

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

export default function App() {
  const organizationId = import.meta.env.VITE_ORGANIZATION_ID
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(null)
  const [message, setMessage] = useState('')

  async function loadMembers() {
    if (!organizationId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('ops_members')
      .select('organization_id,user_id,email,display_name,role,active,permissions,created_at')
      .eq('organization_id', organizationId)
      .order('created_at')

    if (error) setMessage(error.message)
    else setMembers(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadMembers() }, [organizationId])

  function openEdit(member) {
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
    if (!selected || !form) return
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
      setMessage(error.message)
      return
    }

    setMessage('저장 완료')
    await loadMembers()
    setSelected(null)
    setForm(null)
  }

  const activeCount = useMemo(() => members.filter(m => m.active).length, [members])
  const managerCount = useMemo(() => members.filter(m => m.role === 'manager').length, [members])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">AIL AIR TOUR<span>Operation Center</span></div>
        <nav>
          <button><LayoutDashboard size={18}/> 대시보드</button>
          <button className="active"><Users size={18}/> 직원 관리</button>
        </nav>
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <h1>직원 관리</h1>
            <p>등록 직원의 역할, 상태, 세부 권한을 관리합니다.</p>
          </div>
          <div className="master-badge"><ShieldCheck size={16}/> MASTER 보호</div>
        </header>

        <section className="kpis">
          <div className="kpi"><span>전체 직원</span><strong>{members.length}</strong></div>
          <div className="kpi"><span>활성 직원</span><strong>{activeCount}</strong></div>
          <div className="kpi"><span>MANAGER</span><strong>{managerCount}</strong></div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>등록 직원</h2>
            <button onClick={loadMembers}>새로고침</button>
          </div>

          {loading ? <div className="empty">불러오는 중...</div> : (
            <div className="staff-list">
              {members.map(member => (
                <div className="staff-row" key={member.user_id}>
                  <div>
                    <strong>{member.display_name || '이름 없음'}</strong>
                    <span>{member.email}</span>
                  </div>
                  <div className="staff-meta">
                    <span className={`role ${member.role}`}>{member.role.toUpperCase()}</span>
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

        {selected && form && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-head">
                <div>
                  <h2>직원 정보 수정</h2>
                  <p>{selected.email}</p>
                </div>
                <button className="icon-btn" onClick={() => setSelected(null)}><X size={20}/></button>
              </div>

              <label>이름
                <input
                  value={form.display_name}
                  onChange={e => setForm({...form, display_name: e.target.value})}
                />
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
                        onChange={e => setForm({
                          ...form,
                          permissions: {...form.permissions, [key]: e.target.checked}
                        })}
                      />
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
