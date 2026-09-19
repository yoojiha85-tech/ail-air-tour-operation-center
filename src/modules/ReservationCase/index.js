export const CASE_STAGE_ORDER = [
  'consultation',
  'quote',
  'contract',
  'request',
  'reservation',
  'ticketing',
  'balance',
  'briefing',
  'departure',
  'returned',
  'settled',
]

export const CASE_STAGE_LABEL = {
  consultation: '상담',
  quote: '견적',
  contract: '계약',
  request: '예약의뢰',
  reservation: '예약확정',
  ticketing: '발권',
  balance: '잔금',
  briefing: '설명회',
  departure: '출발',
  returned: '귀국',
  settled: '정산',
}

export const normalizeCaseStage = value =>
  CASE_STAGE_ORDER.includes(value) ? value : 'consultation'
