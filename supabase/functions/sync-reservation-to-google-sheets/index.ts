import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
})

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405)
  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return json({ error: '로그인이 필요합니다.' }, 401)
    const { action, reservationId } = await request.json()
    if (!['upsert', 'delete'].includes(action) || typeof reservationId !== 'string') return json({ error: '잘못된 동기화 요청입니다.' }, 400)

    const publicKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
    const publishableKey = publicKeys.default || Deno.env.get('SUPABASE_ANON_KEY')
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    const secretKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!publishableKey || !secretKey) throw new Error('Supabase 함수 키 설정을 찾을 수 없습니다.')

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey, { global: { headers: { Authorization: authorization } } })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: '로그인 정보를 확인할 수 없습니다.' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey)
    const { data: membership } = await admin.from('ops_members').select('organization_id,role,active,permissions').eq('user_id', user.id).eq('active', true).maybeSingle()
    const permissions = membership?.permissions as Record<string, boolean> | null
    const canSync = membership?.role === 'master' || (action === 'delete' ? permissions?.reservation_delete : (permissions?.reservation_create || permissions?.reservation_edit))
    if (!membership || !canSync) return json({ error: '예약 동기화 권한이 없습니다.' }, 403)

    const appsScriptUrl = Deno.env.get('GOOGLE_APPS_SCRIPT_SYNC_URL')
    const syncSecret = Deno.env.get('GOOGLE_APPS_SCRIPT_SYNC_SECRET')
    if (!appsScriptUrl || !syncSecret) return json({ error: 'Google Sheets 동기화 설정이 아직 완료되지 않았습니다.' }, 503)

    let reservation: Record<string, unknown> | null = null
    if (action === 'upsert') {
      const { data, error: reservationError } = await admin.from('ops_reservations').select('*').eq('id', reservationId).eq('organization_id', membership.organization_id).maybeSingle()
      if (reservationError || !data) return json({ error: '예약 정보를 찾을 수 없습니다.' }, 404)
      reservation = data
    }

    const scriptResponse = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: syncSecret, action, reservationId, reservation }),
    })
    const scriptPayload = await scriptResponse.json().catch(() => ({}))
    if (!scriptResponse.ok || !scriptPayload.ok) throw new Error(scriptPayload.error || 'Google Apps Script 동기화 요청에 실패했습니다.')
    return json(scriptPayload)
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : '알 수 없는 동기화 오류입니다.' }, 500)
  }
})
