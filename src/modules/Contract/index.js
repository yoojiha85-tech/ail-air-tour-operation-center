export const CONTRACT_STATUS = {
  draft: '작성중',
  sent: '발송',
  signed: '계약완료',
  cancelled: '취소',
}

export const createContractDraft = ({ reservationId = null, quoteId = null } = {}) => ({
  reservation_id: reservationId,
  quote_id: quoteId,
  status: 'draft',
  contract_date: null,
  total_amount: 0,
  deposit_amount: 0,
  interim_amount: 0,
  balance_amount: 0,
  balance_due_date: null,
  special_terms: '',
  cancellation_terms: '',
})

export { default as ContractWorkspace } from './ContractWorkspace.jsx'
