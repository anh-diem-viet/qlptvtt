// API quản lý nhà trọ theo luồng: Khách tìm phòng -> Xem phòng & thoả thuận -> Ký hợp đồng & thu cọc
// -> Quản lý hằng tháng (chỉ số điện nước, tính tiền phòng + dịch vụ, xuất hoá đơn) -> Thanh toán & ghi nhận
// công nợ / doanh thu -> Kết thúc hợp đồng (hoàn / trừ cọc) -> phòng chuyển về "Trống".
//
// Dữ liệu vận hành và hồ sơ cá nhân lưu trong MySQL (8 bảng theo ERD). Mọi khoản tiền (tiền cọc, tiền phòng,
// hoá đơn) đi qua smart contract; backend chỉ đọc lại từ blockchain nên client không thể tự báo "đã thu".
const express = require('express');
const { getAddress, isAddress, parseEther } = require('ethers');
const { query } = require('./db');
const { requireAuth } = require('./auth');
const { getContract } = require('./indexer');
const { syncLeases, syncBillPayments } = require('./sync');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEI_RE = /^\d{1,60}$/;
const ROOM_CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;
const SCHEDULER_MS = 60 * 60 * 1000;
const AUTO_INVOICE = process.env.AUTO_INVOICE !== 'false';

// Dịch vụ mặc định cho chủ nhà mới (đơn giá quy đổi sang ETH để thanh toán trên blockchain)
const DEFAULT_SERVICES = [
  { name: 'Điện', unit: 'kWh', price: '0.0004', kind: 'metered' }, // ~3.500đ / kWh
  { name: 'Nước', unit: 'm³', price: '0.0018', kind: 'metered' }, // ~15.000đ / m³
  { name: 'Internet', unit: 'tháng', price: '0.006', kind: 'fixed' },
  { name: 'Rác', unit: 'tháng', price: '0.0024', kind: 'fixed' },
  { name: 'Gửi xe', unit: 'tháng', price: '0.006', kind: 'fixed' },
];

const PAYMENT_METHODS = { blockchain: 'Blockchain', tien_mat: 'Tiền mặt', chuyen_khoan: 'Chuyển khoản' };
const EQUIPMENT_STATES = ['tot', 'can_sua', 'hong'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

// ---------------- Tiện ích ----------------

function toInt(v, min, max, name) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} phải là số nguyên từ ${min} đến ${max}`);
  return n;
}

function toWei(v, name, { allowZero = false } = {}) {
  const s = String(v ?? '');
  if (!WEI_RE.test(s) || (!allowZero && BigInt(s) === 0n)) throw bad(`${name} không hợp lệ`);
  return s;
}

function optText(v, max, name) {
  const s = String(v ?? '').trim();
  if (s.length > max) throw bad(`${name} tối đa ${max} ký tự`);
  return s || null;
}

function checkMonth(m) {
  const month = String(m || '');
  if (!MONTH_RE.test(month)) throw bad('Tháng không hợp lệ (YYYY-MM)');
  return month;
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  return [new Date(y, m - 1, 1).getTime() / 1000, new Date(y, m, 1).getTime() / 1000];
}

function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function previousMonth(d = new Date()) {
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
}

const monthOfDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const parseJson = (d) => (typeof d === 'string' ? JSON.parse(d) : d);
const str = (v) => (v == null ? null : String(v));
const placeholders = (arr) => arr.map(() => '?').join(',');

function walletOf(user) {
  if (!user.wallet_address) throw bad('Hãy kết nối và liên kết ví MetaMask với tài khoản trước');
  return user.wallet_address.toLowerCase();
}

function requireChain() {
  const contract = getContract();
  if (!contract) throw new HttpError(503, 'Chưa deploy smart contract');
  return contract;
}

async function ownRoom(ownerId, roomId) {
  const [room] = await query('SELECT * FROM rooms WHERE id = ? AND owner_id = ?', [Number(roomId), ownerId]);
  if (!room) throw new HttpError(404, 'Không tìm thấy phòng');
  return room;
}

// ---------------- DICHVU ----------------

async function listServices(ownerId, { activeOnly = false } = {}) {
  let rows = await query('SELECT * FROM services WHERE owner_id = ? ORDER BY kind DESC, id', [ownerId]);
  if (!rows.length) {
    for (const s of DEFAULT_SERVICES) {
      await query('INSERT IGNORE INTO services (owner_id, name, unit, unit_price_wei, kind) VALUES (?, ?, ?, ?, ?)', [
        ownerId, s.name, s.unit, parseEther(s.price).toString(), s.kind,
      ]);
    }
    rows = await query('SELECT * FROM services WHERE owner_id = ? ORDER BY kind DESC, id', [ownerId]);
  }
  return rows
    .filter((s) => !activeOnly || s.active)
    .map((s) => ({ id: s.id, name: s.name, unit: s.unit, unitPriceWei: str(s.unit_price_wei), kind: s.kind, active: !!s.active }));
}

// ---------------- PHONGTRO + HOPDONG ----------------

async function listRooms(ownerId) {
  const rooms = await query(
    `SELECT r.*, l.status AS lease_status, l.tenant_address, l.rent_wei, l.deposit_wei AS lease_deposit_wei,
            l.start_date, l.end_date, l.paid_periods, l.total_periods, l.period_length
     FROM rooms r LEFT JOIN leases l ON l.lease_id = r.lease_id
     WHERE r.owner_id = ? ORDER BY r.floor, r.code`,
    [ownerId],
  );
  const tenants = await query('SELECT id, room_id, full_name FROM tenants WHERE owner_id = ? ORDER BY id', [ownerId]);
  const equipment = await query(
    `SELECT e.room_id, COUNT(*) AS n, SUM(e.state <> 'tot') AS broken FROM equipment e
     JOIN rooms r ON r.id = e.room_id WHERE r.owner_id = ? GROUP BY e.room_id`,
    [ownerId],
  );
  const eqByRoom = Object.fromEntries(equipment.map((e) => [e.room_id, { count: Number(e.n), needsRepair: Number(e.broken) }]));
  return rooms.map((r) => {
    const status = r.lease_status === 'active' ? 'occupied' : r.lease_status === 'pending' ? 'pending' : 'vacant';
    const hasLease = status !== 'vacant';
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      floor: r.floor,
      area: Number(r.area),
      priceWei: str(r.price_wei),
      depositWei: str(r.deposit_wei),
      note: r.note,
      status,
      leaseId: hasLease ? r.lease_id : null,
      lease: hasLease
        ? {
            leaseId: r.lease_id,
            status: r.lease_status,
            tenantAddress: getAddress(r.tenant_address),
            rentWei: str(r.rent_wei),
            depositWei: str(r.lease_deposit_wei),
            startDate: r.start_date == null ? null : Number(r.start_date),
            endDate: r.end_date == null ? null : Number(r.end_date),
            paidPeriods: r.paid_periods,
            totalPeriods: r.total_periods,
          }
        : null,
      tenants: tenants.filter((t) => t.room_id === r.id).map((t) => ({ id: t.id, name: t.full_name })),
      equipment: eqByRoom[r.id] || { count: 0, needsRepair: 0 },
    };
  });
}

function roomInput(b) {
  const code = String(b.code || '').trim().toUpperCase();
  if (!ROOM_CODE_RE.test(code)) throw bad('Mã phòng 1–20 ký tự: chữ, số, - hoặc _ (vd. P101)');
  const name = String(b.name || '').trim() || `Phòng ${code}`;
  if (name.length > 100) throw bad('Tên phòng tối đa 100 ký tự');
  const area = Number(b.area);
  if (!(area > 0 && area <= 9999)) throw bad('Diện tích phải lớn hơn 0');
  return {
    code,
    name,
    floor: toInt(b.floor, -5, 200, 'Tầng'),
    area,
    price: toWei(b.priceWei, 'Giá thuê'),
    deposit: toWei(b.depositWei ?? '0', 'Tiền cọc', { allowZero: true }),
    note: optText(b.note, 255, 'Ghi chú'),
  };
}

// ---------------- KHACHHANG ----------------

async function listTenants(ownerId) {
  const rows = await query(
    `SELECT t.*, r.code AS room_code FROM tenants t LEFT JOIN rooms r ON r.id = t.room_id
     WHERE t.owner_id = ? ORDER BY t.code`,
    [ownerId],
  );
  return rows.map((t) => ({
    id: t.id,
    code: t.code,
    fullName: t.full_name,
    idNumber: t.id_number,
    phone: t.phone,
    email: t.email,
    hometown: t.hometown,
    roomId: t.room_id,
    roomCode: t.room_code,
    walletAddress: t.wallet_address ? getAddress(t.wallet_address) : null,
    moveInDate: t.move_in_date ? new Date(t.move_in_date).toLocaleDateString('sv-SE') : null,
    peopleCount: t.people_count,
    idPhotoUrl: t.id_photo_url,
  }));
}

async function tenantInput(ownerId, b) {
  const fullName = String(b.fullName || '').trim();
  if (fullName.length < 2 || fullName.length > 100) throw bad('Họ tên 2–100 ký tự');
  const idNumber = optText(b.idNumber, 20, 'CCCD');
  if (idNumber && !/^\d{9}(\d{3})?$/.test(idNumber)) throw bad('CMND 9 số hoặc CCCD 12 số');
  const phone = optText(b.phone, 20, 'Số điện thoại');
  if (phone && !/^\+?\d[\d .-]{7,18}$/.test(phone)) throw bad('Số điện thoại không hợp lệ');
  const email = optText(b.email, 255, 'Email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Email không hợp lệ');
  const wallet = optText(b.walletAddress, 42, 'Ví');
  if (wallet && !isAddress(wallet)) throw bad('Địa chỉ ví không hợp lệ');
  const moveIn = optText(b.moveInDate, 10, 'Ngày vào');
  if (moveIn && !DATE_RE.test(moveIn)) throw bad('Ngày vào không hợp lệ');
  const photo = optText(b.idPhotoUrl, 1024, 'Link ảnh CCCD');
  if (photo && !/^https?:\/\//.test(photo)) throw bad('Link ảnh CCCD phải bắt đầu bằng http(s)://');
  let roomId = null;
  if (b.roomId) roomId = (await ownRoom(ownerId, b.roomId)).id;
  return {
    fullName,
    idNumber,
    phone,
    email,
    hometown: optText(b.hometown, 100, 'Quê quán'),
    roomId,
    wallet: wallet ? wallet.toLowerCase() : null,
    moveIn,
    people: toInt(b.peopleCount ?? 1, 1, 20, 'Số người ở'),
    photo,
  };
}

/** Tạo hồ sơ khách với mã tự tăng KH001, KH002… Trả về id. */
async function createTenant(ownerId, t) {
  const [last] = await query(
    "SELECT MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)) AS n FROM tenants WHERE owner_id = ? AND code LIKE 'KH%'",
    [ownerId],
  );
  const code = `KH${String((Number(last?.n) || 0) + 1).padStart(3, '0')}`;
  const r = await query(
    `INSERT INTO tenants (owner_id, code, full_name, id_number, phone, email, hometown, room_id, wallet_address,
       move_in_date, people_count, id_photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ownerId, code, t.fullName, t.idNumber ?? null, t.phone ?? null, t.email ?? null, t.hometown ?? null, t.roomId ?? null,
      t.wallet ?? null, t.moveIn ?? new Date().toLocaleDateString('sv-SE'), t.people ?? 1, t.photo ?? null],
  );
  return r.insertId;
}

// ---------------- HOADON + PHIEUTHANHTOAN ----------------

/** Trạng thái hoá đơn: draft (chưa phát hành) | issued | partial | paid | cancelled. */
async function decorateInvoices(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const payments = await query(
    `SELECT * FROM payments WHERE invoice_id IN (${placeholders(ids)}) ORDER BY paid_at`,
    ids,
  );
  const billIds = rows.map((r) => r.bill_id).filter(Boolean);
  const cancelled = billIds.length
    ? new Set(
        (await query(
          `SELECT bill_id FROM lease_events WHERE event_name = 'BillCancelled' AND bill_id IN (${placeholders(billIds)})`,
          billIds,
        )).map((r) => r.bill_id),
      )
    : new Set();
  const tenantNames = await query(
    `SELECT room_id, GROUP_CONCAT(full_name ORDER BY id SEPARATOR ', ') AS names FROM tenants
     WHERE room_id IN (${placeholders(rows)}) GROUP BY room_id`,
    rows.map((r) => r.room_id),
  );
  const nameByRoom = Object.fromEntries(tenantNames.map((t) => [t.room_id, t.names]));
  return rows.map((r) => {
    const pays = payments.filter((p) => p.invoice_id === r.id);
    const paid = pays.reduce((s, p) => s + BigInt(p.amount_wei), 0n);
    const total = BigInt(r.total_wei);
    let status = r.bill_id ? 'issued' : 'draft';
    if (r.bill_id && cancelled.has(r.bill_id)) status = 'cancelled';
    if (paid > 0n) status = paid >= total ? 'paid' : 'partial';
    return {
      id: r.id,
      month: r.month,
      roomId: r.room_id,
      roomCode: r.room_code,
      leaseId: r.lease_id,
      tenantAddress: getAddress(r.tenant_address),
      tenantName: nameByRoom[r.room_id] || null,
      ownerName: r.owner_name || null,
      rentPeriods: r.rent_periods,
      rentWei: str(r.rent_wei),
      serviceTotalWei: str(r.service_total_wei),
      totalWei: str(r.total_wei),
      paidWei: paid.toString(),
      remainingWei: (total > paid ? total - paid : 0n).toString(),
      items: parseJson(r.items),
      billId: r.bill_id,
      autoCreated: !!r.auto_created,
      createdAt: new Date(r.created_at).toISOString(),
      // Nội dung ghi lên blockchain: không dấu cho gọn (tối đa 200 byte)
      memo: `HD${r.id} ${r.month} ${r.room_code}`,
      status,
      payments: pays.map((p) => ({
        id: p.id,
        paidAt: new Date(p.paid_at).toISOString(),
        amountWei: str(p.amount_wei),
        method: p.method,
        methodLabel: PAYMENT_METHODS[p.method],
        txHash: p.tx_hash,
        note: p.note,
      })),
    };
  });
}

async function listInvoices(where, params) {
  const rows = await query(
    `SELECT i.*, r.code AS room_code, COALESCE(u.nickname, u.name) AS owner_name
     FROM invoices i JOIN rooms r ON r.id = i.room_id JOIN users u ON u.id = i.owner_id
     WHERE ${where} ORDER BY i.month DESC, r.code`,
    params,
  );
  return decorateInvoices(rows);
}

/**
 * Tạo hoá đơn tháng `month` cho các phòng đang thuê: tiền phòng (1 kỳ nếu hợp đồng còn kỳ chưa trả)
 * + dịch vụ theo chỉ số (cần đủ chỉ số tháng) + dịch vụ cố định. Bỏ qua phòng đã có hoá đơn tháng này.
 */
async function generateInvoices(ownerId, month, { auto = false } = {}) {
  const services = await listServices(ownerId, { activeOnly: true });
  const metered = services.filter((s) => s.kind === 'metered');
  const rooms = (await listRooms(ownerId)).filter((r) => r.status === 'occupied');
  const created = [];
  const skipped = [];
  for (const room of rooms) {
    const [exists] = await query('SELECT id FROM invoices WHERE room_id = ? AND month = ?', [room.id, month]);
    if (exists) {
      skipped.push({ room: room.code, reason: 'Đã có hoá đơn tháng này' });
      continue;
    }
    const usage = await query('SELECT * FROM service_usage WHERE room_id = ? AND month = ?', [room.id, month]);
    const missing = metered.filter((s) => !usage.some((u) => u.service_id === s.id));
    if (missing.length) {
      skipped.push({ room: room.code, reason: `Chưa nhập chỉ số ${missing.map((s) => s.name.toLowerCase()).join(', ')}` });
      continue;
    }
    const items = services.map((s) => {
      const u = usage.find((x) => x.service_id === s.id);
      const quantity = s.kind === 'metered' ? u.new_index - u.old_index : 1;
      return {
        serviceId: s.id,
        name: s.name,
        unit: s.unit,
        kind: s.kind,
        oldIndex: u ? u.old_index : null,
        newIndex: u ? u.new_index : null,
        quantity,
        unitPriceWei: s.unitPriceWei,
        amountWei: (BigInt(quantity) * BigInt(s.unitPriceWei)).toString(),
      };
    });
    const serviceTotal = items.reduce((sum, i) => sum + BigInt(i.amountWei), 0n);
    // Tiền phòng: 1 kỳ nếu hợp đồng còn kỳ chưa trả (khi khách trả hoá đơn, contract cộng kỳ này vào hợp đồng)
    const pendingRent = await query(
      "SELECT COALESCE(SUM(rent_periods), 0) AS n FROM invoices WHERE lease_id = ? AND bill_id IS NULL",
      [room.leaseId],
    );
    const rentPeriods = room.lease.paidPeriods + Number(pendingRent[0].n) < room.lease.totalPeriods ? 1 : 0;
    const rent = BigInt(room.lease.rentWei) * BigInt(rentPeriods);
    const total = rent + serviceTotal;
    if (total === 0n) {
      skipped.push({ room: room.code, reason: 'Tổng tiền bằng 0' });
      continue;
    }
    const r = await query(
      `INSERT INTO invoices (owner_id, room_id, lease_id, tenant_address, month, rent_periods, rent_wei,
         service_total_wei, total_wei, items, auto_created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, room.id, room.leaseId, room.lease.tenantAddress.toLowerCase(), month, rentPeriods, rent.toString(),
        serviceTotal.toString(), total.toString(), JSON.stringify(items), auto ? 1 : 0],
    );
    created.push({ id: r.insertId, room: room.code, totalWei: total.toString() });
  }
  return { created, skipped };
}

// ---------------- Thu chi ----------------

/** Khoản thu từ blockchain (tiền phòng, tiền dịch vụ, khấu trừ cọc) + phiếu thu tiền mặt/chuyển khoản + sổ nhập tay. */
async function cashEntries(ownerId, wallet, fromTs, toTs) {
  const out = [];
  if (wallet) {
    const rows = await query(
      `SELECT e.*, r.code AS room_code FROM lease_events e LEFT JOIN leases l ON l.lease_id = e.lease_id
       LEFT JOIN rooms r ON r.id = l.room_id
       WHERE e.landlord = ? AND e.event_name IN ('RentPaid', 'BillPaid', 'LeaseEnded') AND e.block_time >= ? AND e.block_time < ?`,
      [wallet, fromTs, toTs],
    );
    for (const r of rows) {
      const d = parseJson(r.data);
      let amount = 0n;
      let category = '';
      let note = `Hợp đồng #${r.lease_id}`;
      if (r.event_name === 'RentPaid') {
        amount = BigInt(d.amount);
        category = 'Tiền phòng';
        note += ` · ${d.periods} kỳ`;
      } else if (r.event_name === 'BillPaid') {
        amount = BigInt(d.amount) - BigInt(d.rentAmount); // phần tiền phòng đã tính ở sự kiện RentPaid
        category = 'Tiền dịch vụ';
        note += ` · hoá đơn #${d.billId}`;
      } else {
        amount = BigInt(d.deducted);
        category = 'Khấu trừ tiền cọc';
        if (d.note) note += ` · ${d.note}`;
      }
      if (amount === 0n) continue;
      out.push({ id: `chain-${r.tx_hash}-${r.log_index}`, source: 'chain', date: new Date(Number(r.block_time) * 1000).toISOString(),
        type: 'thu', category, roomCode: r.room_code, amountWei: amount.toString(), note, txHash: r.tx_hash });
    }
  }
  const manualPays = await query(
    `SELECT p.*, i.month, r.code AS room_code FROM payments p JOIN invoices i ON i.id = p.invoice_id
     JOIN rooms r ON r.id = i.room_id
     WHERE i.owner_id = ? AND p.method <> 'blockchain' AND p.paid_at >= FROM_UNIXTIME(?) AND p.paid_at < FROM_UNIXTIME(?)`,
    [ownerId, fromTs, toTs],
  );
  for (const p of manualPays) {
    out.push({ id: `payment-${p.id}`, source: 'payment', date: new Date(p.paid_at).toISOString(), type: 'thu',
      category: `Thu hoá đơn (${PAYMENT_METHODS[p.method].toLowerCase()})`, roomCode: p.room_code,
      amountWei: str(p.amount_wei), note: `Hoá đơn #${p.invoice_id} tháng ${p.month}${p.note ? ` · ${p.note}` : ''}` });
  }
  const manual = await query(
    `SELECT c.*, r.code AS room_code FROM cash_entries c LEFT JOIN rooms r ON r.id = c.room_id
     WHERE c.owner_id = ? AND c.entry_date >= DATE(FROM_UNIXTIME(?)) AND c.entry_date < DATE(FROM_UNIXTIME(?))`,
    [ownerId, fromTs, toTs],
  );
  for (const c of manual) {
    out.push({ id: c.id, source: 'manual', date: new Date(c.entry_date).toISOString(), type: c.type, category: c.category,
      roomCode: c.room_code, roomId: c.room_id, amountWei: str(c.amount_wei), note: c.note });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ---------------- Router ----------------

const router = express.Router();
router.use(requireAuth);

const h = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Dữ liệu bị trùng (mã đã tồn tại)' });
    next(err);
  }
};

// ===== (4) DICHVU =====
router.get('/services', h(async (req, res) => res.json({ services: await listServices(req.user.id) })));

function serviceInput(b) {
  const name = String(b.name || '').trim();
  if (!name || name.length > 50) throw bad('Tên dịch vụ 1–50 ký tự');
  const unit = String(b.unit || '').trim();
  if (!unit || unit.length > 20) throw bad('Đơn vị tính 1–20 ký tự');
  if (b.kind !== 'metered' && b.kind !== 'fixed') throw bad('Loại dịch vụ không hợp lệ');
  return { name, unit, price: toWei(b.unitPriceWei, 'Đơn giá', { allowZero: true }), kind: b.kind, active: b.active === false ? 0 : 1 };
}

router.post('/services', h(async (req, res) => {
  const s = serviceInput(req.body || {});
  await listServices(req.user.id); // tạo dịch vụ mặc định trước nếu chưa có
  await query('INSERT INTO services (owner_id, name, unit, unit_price_wei, kind, active) VALUES (?, ?, ?, ?, ?, ?)', [
    req.user.id, s.name, s.unit, s.price, s.kind, s.active,
  ]);
  res.status(201).json({ services: await listServices(req.user.id) });
}));

router.put('/services/:id', h(async (req, res) => {
  const s = serviceInput(req.body || {});
  const r = await query(
    'UPDATE services SET name = ?, unit = ?, unit_price_wei = ?, kind = ?, active = ? WHERE id = ? AND owner_id = ?',
    [s.name, s.unit, s.price, s.kind, s.active, Number(req.params.id), req.user.id],
  );
  if (!r.affectedRows) throw new HttpError(404, 'Không tìm thấy dịch vụ');
  res.json({ services: await listServices(req.user.id) });
}));

// ===== (1) PHONGTRO =====
router.get('/rooms', h(async (req, res) => res.json({ rooms: await listRooms(req.user.id) })));

router.post('/rooms', h(async (req, res) => {
  const r = roomInput(req.body || {});
  await query(
    'INSERT INTO rooms (owner_id, code, name, floor, area, price_wei, deposit_wei, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, r.code, r.name, r.floor, r.area, r.price, r.deposit, r.note],
  );
  res.status(201).json({ rooms: await listRooms(req.user.id) });
}));

router.put('/rooms/:id', h(async (req, res) => {
  await ownRoom(req.user.id, req.params.id);
  const r = roomInput(req.body || {});
  await query(
    'UPDATE rooms SET code = ?, name = ?, floor = ?, area = ?, price_wei = ?, deposit_wei = ?, note = ? WHERE id = ?',
    [r.code, r.name, r.floor, r.area, r.price, r.deposit, r.note, Number(req.params.id)],
  );
  res.json({ rooms: await listRooms(req.user.id) });
}));

router.delete('/rooms/:id', h(async (req, res) => {
  const room = (await listRooms(req.user.id)).find((r) => r.id === Number(req.params.id));
  if (!room) throw new HttpError(404, 'Không tìm thấy phòng');
  if (room.status !== 'vacant') throw bad('Phòng đang có hợp đồng, không xoá được');
  await query('DELETE FROM rooms WHERE id = ?', [room.id]);
  res.json({ rooms: await listRooms(req.user.id) });
}));

/**
 * Ký hợp đồng: sau khi chủ nhà tạo hợp đồng trên blockchain, gắn hợp đồng với phòng (bảng HOPDONG).
 * Backend đọc lại hợp đồng trên chain để chắc chắn đúng là của chủ nhà này.
 */
router.put('/rooms/:id/lease', h(async (req, res) => {
  const room = await ownRoom(req.user.id, req.params.id);
  const wallet = walletOf(req.user);
  const leaseId = toInt(req.body?.leaseId, 1, 2 ** 31, 'Mã hợp đồng');
  const contract = requireChain();
  let lease;
  try {
    lease = await contract.getLease(leaseId);
  } catch {
    throw bad('Hợp đồng không tồn tại trên blockchain');
  }
  if (lease.landlord.toLowerCase() !== wallet) throw new HttpError(403, 'Hợp đồng này không phải của bạn');
  if (Number(lease.status) > 1) throw bad('Hợp đồng đã kết thúc hoặc đã huỷ');
  const [taken] = await query('SELECT room_id FROM leases WHERE lease_id = ? AND room_id <> ?', [leaseId, room.id]);
  if (taken) throw bad('Hợp đồng đã được gắn với phòng khác');

  // Hồ sơ khách: tìm theo ví người thuê, chưa có thì tạo từ tài khoản Google của khách
  const tenantWallet = lease.tenant.toLowerCase();
  let [tenant] = await query('SELECT id FROM tenants WHERE owner_id = ? AND wallet_address = ?', [req.user.id, tenantWallet]);
  if (!tenant) {
    const [u] = await query('SELECT name, email FROM users WHERE wallet_address = ?', [tenantWallet]);
    tenant = { id: await createTenant(req.user.id, { fullName: u?.name || `Khách ${tenantWallet.slice(0, 8)}`, email: u?.email, wallet: tenantWallet }) };
  }
  await query('UPDATE tenants SET room_id = ? WHERE id = ?', [room.id, tenant.id]);

  await query(
    `INSERT INTO leases (lease_id, owner_id, room_id, tenant_id, tenant_address, rent_wei, deposit_wei, period_length, total_periods)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE room_id = VALUES(room_id), tenant_id = VALUES(tenant_id)`,
    [leaseId, req.user.id, room.id, tenant.id, tenantWallet, lease.rent.toString(), lease.deposit.toString(),
      Number(lease.periodLength), Number(lease.totalPeriods)],
  );
  await query('UPDATE rooms SET lease_id = ? WHERE id = ?', [leaseId, room.id]);
  await syncLeases(contract, [leaseId]);
  // Yêu cầu thuê của khách này cho phòng này: đã thoả thuận xong
  await query(
    `UPDATE room_requests q JOIN users u ON u.id = q.user_id SET q.status = 'accepted'
     WHERE q.room_id = ? AND q.status = 'pending' AND u.wallet_address = ?`,
    [room.id, tenantWallet],
  );
  res.json({ rooms: await listRooms(req.user.id) });
}));

// ===== (8) THIETBI =====
async function listEquipment(roomId) {
  const rows = await query('SELECT * FROM equipment WHERE room_id = ? ORDER BY id', [roomId]);
  return rows.map((e) => ({ id: e.id, roomId: e.room_id, name: e.name, state: e.state, note: e.note }));
}

function equipmentInput(b) {
  const name = String(b.name || '').trim();
  if (!name || name.length > 100) throw bad('Tên thiết bị 1–100 ký tự');
  const state = b.state || 'tot';
  if (!EQUIPMENT_STATES.includes(state)) throw bad('Tình trạng không hợp lệ');
  return { name, state, note: optText(b.note, 255, 'Ghi chú') };
}

router.get('/rooms/:id/equipment', h(async (req, res) => {
  const room = await ownRoom(req.user.id, req.params.id);
  res.json({ equipment: await listEquipment(room.id) });
}));

router.post('/rooms/:id/equipment', h(async (req, res) => {
  const room = await ownRoom(req.user.id, req.params.id);
  const e = equipmentInput(req.body || {});
  await query('INSERT INTO equipment (room_id, name, state, note) VALUES (?, ?, ?, ?)', [room.id, e.name, e.state, e.note]);
  res.status(201).json({ equipment: await listEquipment(room.id) });
}));

router.put('/equipment/:id', h(async (req, res) => {
  const [eq] = await query(
    'SELECT e.room_id FROM equipment e JOIN rooms r ON r.id = e.room_id WHERE e.id = ? AND r.owner_id = ?',
    [Number(req.params.id), req.user.id],
  );
  if (!eq) throw new HttpError(404, 'Không tìm thấy thiết bị');
  const e = equipmentInput(req.body || {});
  await query('UPDATE equipment SET name = ?, state = ?, note = ? WHERE id = ?', [e.name, e.state, e.note, Number(req.params.id)]);
  res.json({ equipment: await listEquipment(eq.room_id) });
}));

router.delete('/equipment/:id', h(async (req, res) => {
  const [eq] = await query(
    'SELECT e.room_id FROM equipment e JOIN rooms r ON r.id = e.room_id WHERE e.id = ? AND r.owner_id = ?',
    [Number(req.params.id), req.user.id],
  );
  if (!eq) throw new HttpError(404, 'Không tìm thấy thiết bị');
  await query('DELETE FROM equipment WHERE id = ?', [Number(req.params.id)]);
  res.json({ equipment: await listEquipment(eq.room_id) });
}));

// ===== (2) KHACHHANG =====
router.get('/tenants', h(async (req, res) => res.json({ tenants: await listTenants(req.user.id) })));

router.post('/tenants', h(async (req, res) => {
  await createTenant(req.user.id, await tenantInput(req.user.id, req.body || {}));
  res.status(201).json({ tenants: await listTenants(req.user.id) });
}));

router.put('/tenants/:id', h(async (req, res) => {
  const [own] = await query('SELECT id FROM tenants WHERE id = ? AND owner_id = ?', [Number(req.params.id), req.user.id]);
  if (!own) throw new HttpError(404, 'Không tìm thấy khách thuê');
  const t = await tenantInput(req.user.id, req.body || {});
  await query(
    `UPDATE tenants SET full_name = ?, id_number = ?, phone = ?, email = ?, hometown = ?, room_id = ?, wallet_address = ?,
       move_in_date = ?, people_count = ?, id_photo_url = ? WHERE id = ?`,
    [t.fullName, t.idNumber, t.phone, t.email, t.hometown, t.roomId, t.wallet, t.moveIn, t.people, t.photo, own.id],
  );
  res.json({ tenants: await listTenants(req.user.id) });
}));

router.delete('/tenants/:id', h(async (req, res) => {
  await query('DELETE FROM tenants WHERE id = ? AND owner_id = ?', [Number(req.params.id), req.user.id]);
  res.json({ tenants: await listTenants(req.user.id) });
}));

// ===== (3) HOPDONG =====
router.get('/leases', h(async (req, res) => {
  const rows = await query(
    `SELECT l.*, r.code AS room_code, r.name AS room_name, t.full_name, t.code AS tenant_code
     FROM leases l JOIN rooms r ON r.id = l.room_id LEFT JOIN tenants t ON t.id = l.tenant_id
     WHERE l.owner_id = ? ORDER BY l.lease_id DESC`,
    [req.user.id],
  );
  res.json({
    leases: rows.map((l) => ({
      leaseId: l.lease_id,
      roomId: l.room_id,
      roomCode: l.room_code,
      roomName: l.room_name,
      tenantId: l.tenant_id,
      tenantCode: l.tenant_code,
      tenantName: l.full_name,
      tenantAddress: getAddress(l.tenant_address),
      rentWei: str(l.rent_wei),
      depositWei: str(l.deposit_wei),
      periodLength: l.period_length,
      totalPeriods: l.total_periods,
      paidPeriods: l.paid_periods,
      startDate: l.start_date == null ? null : Number(l.start_date),
      endDate: l.end_date == null ? null : Number(l.end_date),
      status: l.status,
      depositDeductedWei: str(l.deposit_deducted_wei),
    })),
  });
}));

// ===== (5) SUDUNGDV — chỉ số điện nước =====
router.get('/usage', h(async (req, res) => {
  const month = checkMonth(req.query.month);
  const services = (await listServices(req.user.id, { activeOnly: true })).filter((s) => s.kind === 'metered');
  const rooms = await listRooms(req.user.id);
  const rows = [];
  for (const room of rooms) {
    const items = [];
    for (const s of services) {
      const [cur] = await query('SELECT * FROM service_usage WHERE room_id = ? AND service_id = ? AND month = ?', [room.id, s.id, month]);
      // Chỉ số mới tháng trước trở thành chỉ số cũ tháng này
      const [prev] = await query(
        'SELECT new_index FROM service_usage WHERE room_id = ? AND service_id = ? AND month < ? ORDER BY month DESC LIMIT 1',
        [room.id, s.id, month],
      );
      items.push({ serviceId: s.id, saved: !!cur, oldIndex: cur ? cur.old_index : prev?.new_index ?? 0, newIndex: cur ? cur.new_index : null });
    }
    const [inv] = await query('SELECT id FROM invoices WHERE room_id = ? AND month = ?', [room.id, month]);
    rows.push({ roomId: room.id, roomCode: room.code, roomStatus: room.status, invoiced: !!inv, items });
  }
  res.json({ month, services, rows });
}));

router.put('/usage', h(async (req, res) => {
  const b = req.body || {};
  const month = checkMonth(b.month);
  const room = await ownRoom(req.user.id, b.roomId);
  const [inv] = await query('SELECT id FROM invoices WHERE room_id = ? AND month = ?', [room.id, month]);
  if (inv) throw bad(`Phòng ${room.code} đã có hoá đơn tháng ${month}, xoá hoá đơn trước khi sửa chỉ số`);
  const services = await listServices(req.user.id);
  const items = Array.isArray(b.items) ? b.items : [];
  const clean = items.map((it) => {
    const s = services.find((x) => x.id === Number(it.serviceId) && x.kind === 'metered');
    if (!s) throw bad('Dịch vụ không hợp lệ');
    const oldIndex = toInt(it.oldIndex, 0, 1e9, `Chỉ số cũ ${s.name.toLowerCase()}`);
    const newIndex = toInt(it.newIndex, 0, 1e9, `Chỉ số mới ${s.name.toLowerCase()}`);
    // Chống nhập nhầm: chỉ số mới nhỏ hơn chỉ số cũ
    if (newIndex < oldIndex) throw bad(`Phòng ${room.code}: chỉ số mới ${s.name.toLowerCase()} (${newIndex}) nhỏ hơn chỉ số cũ (${oldIndex})`);
    return { serviceId: s.id, oldIndex, newIndex };
  });
  for (const it of clean) {
    await query(
      `INSERT INTO service_usage (room_id, service_id, month, old_index, new_index) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE old_index = VALUES(old_index), new_index = VALUES(new_index)`,
      [room.id, it.serviceId, month, it.oldIndex, it.newIndex],
    );
  }
  res.json({ ok: true });
}));

// ===== (6) HOADON =====
router.get('/invoices', h(async (req, res) => {
  const month = req.query.month ? checkMonth(req.query.month) : null;
  const invoices = month
    ? await listInvoices('i.owner_id = ? AND i.month = ?', [req.user.id, month])
    : await listInvoices('i.owner_id = ?', [req.user.id]);
  res.json({ invoices });
}));

router.post('/invoices/generate', h(async (req, res) => {
  res.json(await generateInvoices(req.user.id, checkMonth(req.body?.month)));
}));

async function ownInvoice(ownerId, id) {
  const [inv] = await query('SELECT * FROM invoices WHERE id = ? AND owner_id = ?', [Number(id), ownerId]);
  if (!inv) throw new HttpError(404, 'Không tìm thấy hoá đơn');
  return inv;
}

/** Sau khi phát hành hoá đơn lên contract (issueBill), gắn id hoá đơn trên chain. Backend kiểm tra lại trên chain. */
router.put('/invoices/:id/bill', h(async (req, res) => {
  const inv = await ownInvoice(req.user.id, req.params.id);
  if (inv.bill_id) throw bad('Hoá đơn đã được phát hành');
  const billId = toInt(req.body?.billId, 1, 2 ** 31, 'Mã hoá đơn trên chain');
  const contract = requireChain();
  let bill;
  try {
    bill = await contract.getBill(billId);
  } catch {
    throw bad('Hoá đơn không tồn tại trên blockchain');
  }
  if (Number(bill.leaseId) !== inv.lease_id) throw bad('Hoá đơn trên chain thuộc hợp đồng khác');
  if (bill.amount.toString() !== String(inv.total_wei)) throw bad('Số tiền trên chain không khớp hoá đơn');
  if (Number(bill.rentPeriods) !== inv.rent_periods) throw bad('Số kỳ tiền phòng trên chain không khớp hoá đơn');
  if (bill.cancelled) throw bad('Hoá đơn trên chain đã bị huỷ');
  await query('UPDATE invoices SET bill_id = ? WHERE id = ?', [billId, inv.id]);
  await syncBillPayments();
  res.json({ invoices: await listInvoices('i.id = ?', [inv.id]) });
}));

/** (7) PHIEUTHANHTOAN — chủ nhà ghi nhận khoản thu ngoài blockchain (tiền mặt / chuyển khoản). */
router.post('/invoices/:id/payments', h(async (req, res) => {
  const inv = await ownInvoice(req.user.id, req.params.id);
  const b = req.body || {};
  if (b.method !== 'tien_mat' && b.method !== 'chuyen_khoan') throw bad('Hình thức phải là tiền mặt hoặc chuyển khoản');
  const amount = BigInt(toWei(b.amountWei, 'Số tiền thu'));
  const [current] = await decorateInvoices([{ ...inv, room_code: '' }]);
  if (amount > BigInt(current.remainingWei)) throw bad('Số tiền thu vượt quá số còn lại của hoá đơn');
  const date = DATE_RE.test(String(b.date || '')) ? b.date : new Date().toLocaleDateString('sv-SE');
  await query('INSERT INTO payments (invoice_id, paid_at, amount_wei, method, note) VALUES (?, ?, ?, ?, ?)', [
    inv.id, `${date} ${new Date().toTimeString().slice(0, 8)}`, amount.toString(), b.method, optText(b.note, 255, 'Ghi chú'),
  ]);
  res.status(201).json({ invoices: await listInvoices('i.id = ?', [inv.id]) });
}));

router.delete('/invoices/:id', h(async (req, res) => {
  const inv = await ownInvoice(req.user.id, req.params.id);
  const [d] = await decorateInvoices([{ ...inv, room_code: '' }]);
  if (d.payments.length) throw bad('Hoá đơn đã có phiếu thu, không xoá được');
  if (d.status === 'issued') throw bad('Hoá đơn đã phát hành: huỷ trên blockchain trước rồi mới xoá');
  await query('DELETE FROM invoices WHERE id = ?', [inv.id]);
  res.json({ ok: true });
}));

/** Hoá đơn của người thuê (theo ví đã liên kết). */
router.get('/my/invoices', h(async (req, res) => {
  if (!req.user.wallet_address) return res.json({ invoices: [] });
  res.json({ invoices: await listInvoices('i.tenant_address = ?', [req.user.wallet_address.toLowerCase()]) });
}));

// ===== Thu chi =====
router.get('/cashflow', h(async (req, res) => {
  const month = checkMonth(req.query.month);
  const [from, to] = monthRange(month);
  const entries = await cashEntries(req.user.id, req.user.wallet_address?.toLowerCase(), from, to);
  const sum = (type) => entries.filter((e) => e.type === type).reduce((s, e) => s + BigInt(e.amountWei), 0n);
  const income = sum('thu');
  const expense = sum('chi');
  res.json({ month, entries, incomeWei: income.toString(), expenseWei: expense.toString(), netWei: (income - expense).toString() });
}));

router.post('/cashflow', h(async (req, res) => {
  const b = req.body || {};
  if (!DATE_RE.test(String(b.date || ''))) throw bad('Ngày không hợp lệ');
  if (b.type !== 'thu' && b.type !== 'chi') throw bad('Loại phải là Thu hoặc Chi');
  const category = String(b.category || '').trim();
  if (!category || category.length > 50) throw bad('Hạng mục 1–50 ký tự');
  let roomId = null;
  if (b.roomId) roomId = (await ownRoom(req.user.id, b.roomId)).id;
  await query(
    'INSERT INTO cash_entries (owner_id, entry_date, type, category, room_id, amount_wei, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, b.date, b.type, category, roomId, toWei(b.amountWei, 'Số tiền'), optText(b.note, 255, 'Ghi chú')],
  );
  res.status(201).json({ ok: true });
}));

router.delete('/cashflow/:id', h(async (req, res) => {
  await query('DELETE FROM cash_entries WHERE id = ? AND owner_id = ?', [Number(req.params.id), req.user.id]);
  res.json({ ok: true });
}));

// ===== Dashboard tổng quan =====
router.get('/overview', h(async (req, res) => {
  const rooms = await listRooms(req.user.id);
  const occupied = rooms.filter((r) => r.status === 'occupied');
  const contract = getContract();
  const invoices = await listInvoices('i.owner_id = ?', [req.user.id]);
  const open = invoices.filter((i) => i.status === 'issued' || i.status === 'partial');

  // Công nợ = phần còn lại của hoá đơn đã phát hành + tiền phòng quá hạn chưa nằm trong hoá đơn nào
  const reminders = [];
  let unpaidInvoices = 0n;
  for (const inv of open) {
    unpaidInvoices += BigInt(inv.remainingWei);
    reminders.push({ kind: 'invoice', roomCode: inv.roomCode, tenants: inv.tenantName ? [inv.tenantName] : [],
      month: inv.month, invoiceId: inv.id, amountWei: inv.remainingWei });
  }
  let overdueRent = 0n;
  let depositsHeld = 0n;
  for (const room of occupied) {
    depositsHeld += BigInt(room.lease.depositWei || 0);
    if (!contract) continue;
    let periods = Number(await contract.overduePeriods(room.leaseId).catch(() => 0n));
    periods -= open.filter((i) => i.leaseId === room.leaseId).reduce((s, i) => s + i.rentPeriods, 0);
    if (periods > 0) {
      const amount = BigInt(room.lease.rentWei) * BigInt(periods);
      overdueRent += amount;
      reminders.push({ kind: 'rent', roomCode: room.code, tenants: room.tenants.map((t) => t.name), leaseId: room.leaseId,
        periods, amountWei: amount.toString() });
    }
  }

  // Doanh thu & chi phí 6 tháng gần nhất
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(monthOfDate(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const revenue = [];
  for (const m of months) {
    const [from, to] = monthRange(m);
    const entries = await cashEntries(req.user.id, req.user.wallet_address?.toLowerCase(), from, to);
    const sum = (type) => entries.filter((e) => e.type === type).reduce((s, e) => s + BigInt(e.amountWei), 0n);
    revenue.push({ month: m, incomeWei: sum('thu').toString(), expenseWei: sum('chi').toString() });
  }
  const requests = await query(
    `SELECT COUNT(*) AS n FROM room_requests q JOIN rooms r ON r.id = q.room_id WHERE r.owner_id = ? AND q.status = 'pending'`,
    [req.user.id],
  );

  res.json({
    totalRooms: rooms.length,
    occupiedRooms: occupied.length,
    pendingRooms: rooms.filter((r) => r.status === 'pending').length,
    vacantRooms: rooms.filter((r) => r.status === 'vacant').length,
    occupancyRate: rooms.length ? occupied.length / rooms.length : 0,
    unpaidInvoicesWei: unpaidInvoices.toString(),
    overdueRentWei: overdueRent.toString(),
    debtWei: (unpaidInvoices + overdueRent).toString(),
    draftInvoices: invoices.filter((i) => i.status === 'draft').length,
    depositsHeldWei: depositsHeld.toString(),
    pendingRequests: Number(requests[0].n),
    revenue,
    reminders,
    walletLinked: !!req.user.wallet_address,
  });
}));

// ===== Khách tìm phòng -> Xem phòng & Thoả thuận =====

/** Phòng trống của mọi chủ nhà (trừ phòng của chính mình) để khách tìm. */
router.get('/market/rooms', h(async (req, res) => {
  const rows = await query(
    `SELECT r.*, COALESCE(u.nickname, u.name) AS owner_name, l.status AS lease_status
     FROM rooms r JOIN users u ON u.id = r.owner_id LEFT JOIN leases l ON l.lease_id = r.lease_id
     WHERE r.owner_id <> ? AND (l.status IS NULL OR l.status IN ('ended', 'cancelled'))
     ORDER BY r.price_wei, r.code`,
    [req.user.id],
  );
  const mine = await query("SELECT room_id, status FROM room_requests WHERE user_id = ? AND status IN ('pending', 'accepted')", [req.user.id]);
  const myStatus = Object.fromEntries(mine.map((m) => [m.room_id, m.status]));
  const equipment = rows.length
    ? await query(`SELECT room_id, name, state FROM equipment WHERE room_id IN (${placeholders(rows)}) ORDER BY id`, rows.map((r) => r.id))
    : [];
  res.json({
    rooms: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      floor: r.floor,
      area: Number(r.area),
      priceWei: str(r.price_wei),
      depositWei: str(r.deposit_wei),
      note: r.note,
      ownerName: r.owner_name,
      equipment: equipment.filter((e) => e.room_id === r.id).map((e) => ({ name: e.name, state: e.state })),
      myRequest: myStatus[r.id] || null,
    })),
  });
}));

router.post('/market/rooms/:id/requests', h(async (req, res) => {
  if (!req.user.wallet_address) throw bad('Hãy liên kết ví MetaMask trước để chủ nhà tạo hợp đồng cho bạn');
  const [room] = await query(
    'SELECT r.*, l.status AS lease_status FROM rooms r LEFT JOIN leases l ON l.lease_id = r.lease_id WHERE r.id = ?',
    [Number(req.params.id)],
  );
  if (!room) throw new HttpError(404, 'Không tìm thấy phòng');
  if (room.owner_id === req.user.id) throw bad('Không thể thuê phòng của chính mình');
  if (room.lease_status === 'active' || room.lease_status === 'pending') throw bad('Phòng đã có người thuê');
  const [dup] = await query("SELECT id FROM room_requests WHERE room_id = ? AND user_id = ? AND status = 'pending'", [room.id, req.user.id]);
  if (dup) throw bad('Bạn đã gửi yêu cầu cho phòng này, hãy chờ chủ nhà phản hồi');
  await query('INSERT INTO room_requests (room_id, user_id, message) VALUES (?, ?, ?)', [
    room.id, req.user.id, optText(req.body?.message, 500, 'Lời nhắn'),
  ]);
  res.status(201).json({ ok: true });
}));

/** Chủ nhà: yêu cầu thuê gửi tới các phòng của mình. */
router.get('/requests', h(async (req, res) => {
  const rows = await query(
    `SELECT q.*, r.code AS room_code, r.price_wei, r.deposit_wei, u.name, u.nickname, u.email, u.wallet_address
     FROM room_requests q JOIN rooms r ON r.id = q.room_id JOIN users u ON u.id = q.user_id
     WHERE r.owner_id = ? ORDER BY q.status = 'pending' DESC, q.created_at DESC LIMIT 100`,
    [req.user.id],
  );
  res.json({
    requests: rows.map((q) => ({
      id: q.id,
      roomId: q.room_id,
      roomCode: q.room_code,
      priceWei: str(q.price_wei),
      depositWei: str(q.deposit_wei),
      name: q.nickname || q.name,
      email: q.email,
      walletAddress: q.wallet_address ? getAddress(q.wallet_address) : null,
      message: q.message,
      status: q.status,
      createdAt: new Date(q.created_at).toISOString(),
    })),
  });
}));

router.put('/requests/:id', h(async (req, res) => {
  if (req.body?.status !== 'rejected') throw bad('Chỉ từ chối được ở đây; chấp nhận bằng cách tạo hợp đồng cho phòng');
  const r = await query(
    `UPDATE room_requests q JOIN rooms r ON r.id = q.room_id SET q.status = 'rejected'
     WHERE q.id = ? AND r.owner_id = ? AND q.status = 'pending'`,
    [Number(req.params.id), req.user.id],
  );
  if (!r.affectedRows) throw new HttpError(404, 'Không tìm thấy yêu cầu đang chờ');
  res.json({ ok: true });
}));

router.get('/my/requests', h(async (req, res) => {
  const rows = await query(
    `SELECT q.*, r.code AS room_code, r.name AS room_name, COALESCE(u.nickname, u.name) AS owner_name FROM room_requests q
     JOIN rooms r ON r.id = q.room_id JOIN users u ON u.id = r.owner_id
     WHERE q.user_id = ? ORDER BY q.created_at DESC LIMIT 50`,
    [req.user.id],
  );
  res.json({
    requests: rows.map((q) => ({ id: q.id, roomCode: q.room_code, roomName: q.room_name, ownerName: q.owner_name,
      status: q.status, message: q.message, createdAt: new Date(q.created_at).toISOString() })),
  });
}));

router.delete('/my/requests/:id', h(async (req, res) => {
  await query("UPDATE room_requests SET status = 'withdrawn' WHERE id = ? AND user_id = ? AND status = 'pending'", [
    Number(req.params.id), req.user.id,
  ]);
  res.json({ ok: true });
}));

// ---------------- Tự động tạo hoá đơn đầu tháng ----------------

/** Mỗi giờ: tạo hoá đơn tháng trước cho các phòng đã đủ chỉ số (chạy lại không tạo trùng). Tắt bằng AUTO_INVOICE=false. */
function startScheduler() {
  if (!AUTO_INVOICE) return;
  const tick = async () => {
    try {
      const month = previousMonth();
      const owners = await query('SELECT DISTINCT owner_id FROM rooms');
      for (const { owner_id: ownerId } of owners) {
        const { created } = await generateInvoices(ownerId, month, { auto: true });
        if (created.length) console.log(`[scheduler] Tự tạo ${created.length} hoá đơn tháng ${month} cho chủ nhà #${ownerId}`);
      }
    } catch (err) {
      console.warn(`[scheduler] Lỗi tạo hoá đơn tự động: ${err.message}`);
    } finally {
      setTimeout(tick, SCHEDULER_MS);
    }
  };
  setTimeout(tick, 10_000);
}

module.exports = { router, startScheduler, nextMonth };
