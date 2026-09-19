# MASTER ERP modules

아일항공 Operation Center를 단일 `App.jsx` 중심 구조에서 업무 도메인별 모듈로 분리하기 위한 기준입니다.

## Core domains

### Consultation
상담 접수, 상담기록, 담당자 배정, 후속 연락, 견적 전환의 시작점입니다.

### Quote
견적 1~5안, 견적 버전, 고객 발송, 선택안 확정을 관리합니다. 견적은 덮어쓰지 않고 버전 이력을 유지합니다.

### Contract
선택 견적을 계약 스냅샷으로 고정하고 계약금·중도금·잔금·특약·취소규정·동의 이력을 관리합니다.

### ReservationCase
상담부터 정산까지 하나의 CASE로 묶는 오케스트레이션 계층입니다. 고객정보를 단계별로 반복 입력하지 않고 기존 데이터를 승계합니다.

### Finance
매출, 수납, 미수, 원가, 예상수익, 실제수익, 환율조정을 계산·표시합니다. 고객 화면과 내부 원가 화면의 권한을 분리합니다.

## Target flow

`Consultation → Quote → Contract → ReservationCase → Finance`

실제 예약 수행은 ReservationCase 내부에서 여행자, 항공, 호텔, 랜드, 문서, 출발체크, 정산 데이터와 연결합니다.
