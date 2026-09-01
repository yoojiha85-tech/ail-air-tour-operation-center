const SYNC_SHEET_NAME = '운영센터_예약동기화';

const PRODUCT_LABEL = { honeymoon: '허니문', package: '해외패키지', air: '해외항공권', group: '국내·외 단체' };
const STATUS_LABEL = { inquiry: '문의', confirmed: '확정', ticketed: '발권', departed: '출발', completed: '완료', cancelled: '취소' };
const SETTLEMENT_LABEL = { unsettled: '미정산', provisional: '가정산', confirmed: '정산확정', closed: '마감' };

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
    if (!expectedSecret || payload.secret !== expectedSecret) return response_({ ok: false, error: 'Unauthorized' });

    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!spreadsheetId) return response_({ ok: false, error: 'SPREADSHEET_ID is not configured' });
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(SYNC_SHEET_NAME);
    if (!sheet) return response_({ ok: false, error: `Sheet not found: ${SYNC_SHEET_NAME}` });

    const reservationId = String(payload.reservationId || '');
    if (!reservationId) return response_({ ok: false, error: 'reservationId is required' });
    const rowNumber = findRow_(sheet, reservationId);

    if (payload.action === 'delete') {
      if (!rowNumber) return response_({ ok: true, action: 'skipped' });
      sheet.deleteRow(rowNumber);
      return response_({ ok: true, action: 'deleted', row: rowNumber });
    }
    if (payload.action !== 'upsert' || !payload.reservation) return response_({ ok: false, error: 'Invalid action' });

    const values = reservationValues_(payload.reservation);
    if (rowNumber) {
      sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
      return response_({ ok: true, action: 'updated', row: rowNumber });
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    return response_({ ok: true, action: 'inserted' });
  } catch (error) {
    console.error(error);
    return response_({ ok: false, error: String(error.message || error) });
  }
}

function findRow_(sheet, reservationId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const keys = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const index = keys.findIndex(([value]) => value === reservationId);
  return index < 0 ? 0 : index + 2;
}

function reservationValues_(reservation) {
  const text = value => value === null || value === undefined ? '' : value;
  return [
    text(reservation.id), text(reservation.reservation_code), PRODUCT_LABEL[reservation.product_type] || text(reservation.product_type),
    STATUS_LABEL[reservation.status] || text(reservation.status), text(reservation.customer_name), text(reservation.customer_phone),
    text(reservation.title), text(reservation.destination), text(reservation.partner_name), text(reservation.manager_name),
    text(reservation.traveler_count), text(reservation.departure_date), text(reservation.return_date), text(reservation.sale_amount),
    SETTLEMENT_LABEL[reservation.settlement_status] || text(reservation.settlement_status), text(reservation.memo),
    text(reservation.updated_at), new Date().toISOString(),
  ];
}

function response_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
