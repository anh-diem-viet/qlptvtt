// API đọc dữ liệu đã đồng bộ từ blockchain: nhật ký từng hợp đồng, hoạt động gần đây và thống kê thu/chi.
// Trạng thái hợp đồng, tiền cọc, số dư... vẫn đọc trực tiếp từ smart contract ở frontend.
const express = require('express');
const { isAddress } = require('ethers');
const { query } = require('./db');
const { indexerStatus } = require('./indexer');

const ACTIVITY_LIMIT = 30;

function toEvent(r) {
  return {
    leaseId: r.lease_id,
    name: r.event_name,
    landlord: r.landlord,
    tenant: r.tenant,
    actor: r.actor,
    amountWei: String(r.amount_wei),
    data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    blockNumber: Number(r.block_number),
    txHash: r.tx_hash,
    time: Number(r.block_time),
  };
}

function addressParam(req, res) {
  const { address } = req.query;
  if (!isAddress(address)) {
    res.status(400).json({ message: 'Địa chỉ ví không hợp lệ' });
    return null;
  }
  return address.toLowerCase();
}

const router = express.Router();

/** Nhật ký một hợp đồng (cũ -> mới). */
router.get('/leases/:id/events', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Mã hợp đồng không hợp lệ' });
  const rows = await query('SELECT * FROM lease_events WHERE lease_id = ? ORDER BY block_number, log_index', [id]);
  res.json({ events: rows.map(toEvent), indexer: await indexerStatus() });
});

/** Hoạt động gần đây trên các hợp đồng mà ví là chủ nhà hoặc người thuê (mới -> cũ). */
router.get('/activity', async (req, res) => {
  const address = addressParam(req, res);
  if (!address) return;
  const rows = await query(
    `SELECT * FROM lease_events WHERE landlord = ? OR tenant = ?
     ORDER BY block_number DESC, log_index DESC LIMIT ${ACTIVITY_LIMIT}`,
    [address, address],
  );
  res.json({ events: rows.map(toEvent) });
});

/** Thống kê thu/chi của một ví. Tiền tính bằng BigInt (wei) trong JS để không mất chính xác. */
router.get('/stats', async (req, res) => {
  const address = addressParam(req, res);
  if (!address) return;
  const rows = await query(
    `SELECT event_name, landlord, tenant, amount_wei, data FROM lease_events
     WHERE (landlord = ? OR tenant = ?) AND event_name IN ('RentPaid', 'LeaseEnded', 'LeaseSigned')`,
    [address, address],
  );

  const landlord = { rentReceived: 0n, depositReceived: 0n, payments: 0, signedLeases: 0 };
  const tenant = { rentPaid: 0n, depositRefunded: 0n, depositLost: 0n, payments: 0, signedLeases: 0 };
  for (const r of rows) {
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    const asLandlord = r.landlord === address;
    const asTenant = r.tenant === address;
    if (r.event_name === 'LeaseSigned') {
      if (asLandlord) landlord.signedLeases++;
      if (asTenant) tenant.signedLeases++;
    } else if (r.event_name === 'RentPaid') {
      const amount = BigInt(data.amount);
      if (asLandlord) {
        landlord.rentReceived += amount;
        landlord.payments++;
      }
      if (asTenant) {
        tenant.rentPaid += amount;
        tenant.payments++;
      }
    } else if (r.event_name === 'LeaseEnded') {
      const deducted = BigInt(data.deducted);
      if (asLandlord) landlord.depositReceived += deducted;
      if (asTenant) {
        tenant.depositRefunded += BigInt(data.refunded);
        tenant.depositLost += deducted;
      }
    }
  }
  const str = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]));
  res.json({ landlord: str(landlord), tenant: str(tenant), indexer: await indexerStatus() });
});

module.exports = { router };
