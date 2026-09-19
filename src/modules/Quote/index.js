export const QUOTE_STATUS = {
  draft: '작성중',
  sent: '견적발송',
  selected: '고객선택',
  expired: '만료',
  cancelled: '취소',
}

export const createQuoteDraft = reservationId => ({
  reservation_id: reservationId || null,
  status: 'draft',
  version_no: 1,
  currency: 'KRW',
  total_amount: 0,
  valid_until: null,
  customer_note: '',
  internal_note: '',
  items: [],
})
