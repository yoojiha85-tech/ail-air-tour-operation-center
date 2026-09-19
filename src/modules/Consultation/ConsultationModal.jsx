const STATUS_LABEL = {
  new: '신규',
  contacting: '상담중',
  quoted: '견적발송',
  contracted: '계약완료',
  converted: '예약전환',
  hold: '보류',
  closed: '종료',
}

const formatDate = value => {
  if (!value) return ''
  return String(value).slice(0, 10)
}

export default function ConsultationModal({
  consultation,
  canEdit = false,
  canCreate = false,
  onClose,
  onStart,
  onConvert,
}) {
  if (!consultation) return null

  const phone = String(consultation.phone || '').replace(/[^0-9+]/g, '')
  const linked = !!consultation.reservation_id

  return (
    <div className="modalBack">
      <div className="modalBox reservationForm">
        <button type="button" className="close" onClick={onClose} aria-label="상담 상세 닫기">
          ×
        </button>

        <h2>신규 상담 상세</h2>
        <p className="modalIntro">
          {consultation.request_code} · {consultation.request_type}
        </p>

        <div className="modalGrid">
          <label>
            고객명
            <input readOnly value={consultation.customer_name || ''} />
          </label>

          <label>
            전화번호
            <input readOnly value={consultation.phone || ''} />
          </label>

          <label>
            희망여행지
            <input readOnly value={consultation.destination || ''} />
          </label>

          <label>
            출발예정일
            <input readOnly value={formatDate(consultation.departure_date)} />
          </label>

          <label>
            여행인원
            <input readOnly value={consultation.traveler_count || ''} />
          </label>

          <label>
            예상예산
            <input readOnly value={consultation.budget || ''} />
          </label>

          <label>
            예식일
            <input readOnly value={formatDate(consultation.wedding_date)} />
          </label>

          <label>
            상담상태
            <input
              readOnly
              value={STATUS_LABEL[consultation.status] || consultation.status || ''}
            />
          </label>

          <label className="span2">
            요청사항
            <textarea
              rows="4"
              readOnly
              value={consultation.request_memo || '별도 요청사항 없음'}
            />
          </label>
        </div>

        <div className="modalActions">
          <button type="button" className="secondary" onClick={onClose}>
            닫기
          </button>

          <button
            type="button"
            className="secondary"
            disabled={!phone}
            onClick={() => {
              window.location.href = `tel:${phone}`
            }}
          >
            전화하기
          </button>

          <button
            type="button"
            disabled={consultation.status !== 'new' || !canEdit}
            onClick={() => onStart?.(consultation)}
          >
            {consultation.status === 'new' ? '상담 시작' : '상담 진행중'}
          </button>

          <button
            type="button"
            className="primary"
            disabled={linked || !canCreate || !canEdit}
            onClick={() => onConvert?.(consultation)}
          >
            {linked ? '예약 연결완료' : '예약으로 전환'}
          </button>
        </div>
      </div>
    </div>
  )
}
