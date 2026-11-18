// Đồng bộ dữ liệu từ blockchain sang các bảng quản lý (HOPDONG, PHIEUTHANHTOAN).
// Smart contract là nguồn sự thật cho tiền: trạng thái hợp đồng, số kỳ đã trả, hoá đơn đã thanh toán.
const { query } = require('./db');

const STATUS = ['pending', 'active', 'ended', 'cancelled'];

/** Cập nhật bảng leases cho các hợp đồng đã gắn với phòng, đọc trực tiếp từ contract. */
async function syncLeases(contract, leaseIds) {
  const ids = [...new Set(leaseIds.map(Number))].filter(Boolean);
  if (!ids.length) return;
  const rows = await query(`SELECT lease_id FROM leases WHERE lease_id IN (${ids.map(() => '?').join(',')})`, ids);
  for (const { lease_id: id } of rows) {
    const l = await contract.getLease(id);
    const start = Number(l.startDate);
    await query(
      `UPDATE leases SET status = ?, paid_periods = ?, total_periods = ?, start_date = ?, end_date = ?,
         deposit_deducted_wei = ? WHERE lease_id = ?`,
      [
        STATUS[Number(l.status)],
        Number(l.paidPeriods),
        Number(l.totalPeriods),
        start || null,
        start ? start + Number(l.totalPeriods) * Number(l.periodLength) : null,
        l.depositDeducted.toString(),
        id,
      ],
    );
  }
}

/** Ghi phiếu thu (hình thức blockchain) cho các hoá đơn đã được trả trên chain mà chưa có phiếu. */
async function syncBillPayments() {
  await query(
    `INSERT IGNORE INTO payments (invoice_id, paid_at, amount_wei, method, tx_hash, log_index, note)
     SELECT i.id, FROM_UNIXTIME(e.block_time), e.amount_wei, 'blockchain', e.tx_hash, e.log_index,
            CONCAT('Thanh toán hoá đơn #', e.bill_id, ' trên blockchain')
     FROM lease_events e JOIN invoices i ON i.bill_id = e.bill_id
     WHERE e.event_name = 'BillPaid'`,
  );
}

module.exports = { syncLeases, syncBillPayments };
