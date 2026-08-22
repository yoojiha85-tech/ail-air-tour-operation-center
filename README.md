# AIL AIR TOUR Operation Center

여행사 내부 운영을 위한 AIL AIR TOUR Operation Center 프론트엔드입니다.

## 현재 포함 기능

- React + Vite 기반 프론트엔드
- Supabase 연동
- 직원 목록 조회
- 직원 이름 / 역할 / 활성상태 수정
- 기능별 접근 권한 체크박스 수정
- `ops_update_staff_member` RPC 연결
- MASTER 계정 UI 보호
- 반응형 직원관리 화면

## 실행

```bash
npm install
cp .env.example .env
npm run dev
```

`.env`에 아래 값을 입력하세요.

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_ORGANIZATION_ID=...
```

## 권한 정책

- MASTER: 최고관리자
- MANAGER: 전체 운영 및 직원관리 가능
- MANAGER는 MASTER 계정을 수정/강등/비활성화할 수 없음
