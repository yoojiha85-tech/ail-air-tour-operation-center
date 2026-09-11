# 직원 가입·권한 관리 보안 강화 Preview

기준일: 2026-09-12

## 목표
기존 MASTER 계정과 현재 직원 데이터는 변경하지 않고, 직원 가입·승인·권한 관리 절차를 하나의 안전한 운영 흐름으로 정리한다.

## Preview 반영
1. 직원관리 메뉴는 MASTER 전용
2. 가입 요청 중복 제출 서버 차단
3. 승인/사전등록은 같은 이메일이면 UPSERT로 갱신
4. 승인 사전등록 유효기간 7일
5. 승인 후 계정 만들기 전에 서버가 유효 승인 여부 확인
6. staff_manage는 일반 역할에 부여 불가
7. 직원/관리자/조회전용 역할을 MASTER가 변경 가능
8. 활성 사전등록 목록과 만료일·위험권한 경고 표시
9. 기존 과도한 권한 초대는 자동 수정하지 않고 경고만 표시
10. ops_staff_applications는 레거시 안전장치로 남기고 공식 UI에서는 ops_signup_requests 흐름만 사용

## Preview용 서버
- Supabase Edge Function: ops-staff-access-preview
- 기존 운영 페이지는 이 함수를 호출하지 않으므로 현재 Production 가입/권한 동작에는 영향 없음.

## Production 전 적용 예정 DB Migration
- ops_signup_requests pending 이메일 중복 unique index
- ops_members 직원관리 RLS를 MASTER-only로 강화
- ops_staff_invites RLS를 MASTER-only로 강화
- 신규 계정 트리거에서 승인 invite를 created_at 기준 7일까지만 인정
- 기존 MASTER/직원 레코드는 삭제·재작성하지 않음

## 검수 포인트
- MASTER 본인 계정 변경 불가
- MASTER 외 직원관리 화면 접근 불가
- staff_manage 토글 잠금
- 동일 이메일 재승인 시 중복 오류 없음
- 승인 7일 초과 시 계정 생성 차단
- 가입 요청 중복 시 새 row 생성 없이 안내
- 기존 예약/입금/지출/정산 기능 변경 없음
