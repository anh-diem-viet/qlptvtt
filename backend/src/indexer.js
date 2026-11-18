// Đồng bộ sự kiện của các hợp đồng thuê từ blockchain vào MySQL (bảng lease_events).
// Nhật ký hợp đồng và thống kê thu/chi chỉ dựa trên log do contract phát ra, nên client không thể làm giả.
const fs = require('fs');
const path = require('path');
const { Contract, JsonRpcProvider } = require('ethers');
const { query, getMeta, setMeta } = require('./db');
const { syncLeases, syncBillPayments } = require('./sync');

const DEFAULT_RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:7545';
const DEPLOYMENT_FILE = path.join(__dirname, 'contracts', 'RentalManager.json');
const POLL_MS = 3000;
const MAX_RANGE = 2000; // số block tối đa mỗi lần query log

// Sự kiện đưa vào bảng lease_events và tham số giữ "số tiền chính" của từng sự kiện
const LEASE_EVENTS = {
  LeaseCreated: { actor: 'landlord', amount: 'rent' },
  LeaseCancelled: { actor: 'by' },
  LeaseSigned: { actor: 'tenant' },
  RentPaid: { actor: 'tenant', amount: 'amount' },
  ExtensionProposed: { actor: 'by' },
  ExtensionCancelled: { actor: 'by' },
  LeaseExtended: {},
  LeaseEnded: { amount: 'refunded' },
  BillIssued: { amount: 'amount' },
  BillPaid: { actor: 'tenant', amount: 'amount' },
  BillCancelled: {},
};

let provider = null;
let contract = null;
let chainId = null;
let deploymentMtime = 0;
let lastError = null;

function loadDeployment() {
  let stat;
  try {
    stat = fs.statSync(DEPLOYMENT_FILE);
  } catch {
    return null;
  }
  // `npm run deploy` ghi đè file này, nên đọc lại khi file thay đổi
  if (!contract || stat.mtimeMs !== deploymentMtime) {
    // Dùng RPC của mạng đã deploy (Ganache 7545 hoặc Hardhat 8545)
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
    const { address, abi, rpcUrl } = deployment;
    provider?.destroy();
    provider = new JsonRpcProvider(rpcUrl || DEFAULT_RPC_URL, undefined, { staticNetwork: true, polling: false });
    contract = new Contract(address, abi, provider);
    chainId = deployment.chainId;
    console.log(`[indexer] Theo dõi contract ${address} tại ${rpcUrl || DEFAULT_RPC_URL}`);
    deploymentMtime = stat.mtimeMs;
  }
  return contract;
}

async function resetEvents(reason) {
  console.log(`[indexer] Xoá dữ liệu cũ: ${reason}`);
  await query('DELETE FROM lease_events');
  // Hợp đồng / hoá đơn cũ không còn trên chain mới: bỏ liên kết, giữ lại phòng, khách thuê, chỉ số điện nước
  await query('UPDATE rooms SET lease_id = NULL');
  await query('DELETE FROM leases'); // xoá kèm hoá đơn, phiếu thu (khoá ngoại CASCADE)
  await setMeta('lastBlock', null);
  await setMeta('lastBlockHash', null);
}

const INSERT_EVENT = `
  INSERT IGNORE INTO lease_events
    (lease_id, event_name, landlord, tenant, actor, amount_wei, data, block_number, tx_hash, log_index, block_time, bill_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** Tham số sự kiện -> object JSON (bigint thành chuỗi). */
function argsToJson(ev) {
  const out = {};
  ev.fragment.inputs.forEach((input, i) => {
    const v = ev.args[i];
    out[input.name] = typeof v === 'bigint' ? v.toString() : v;
  });
  return out;
}

async function syncOnce() {
  const rental = loadDeployment();
  if (!rental) return;
  const address = (await rental.getAddress()).toLowerCase();

  if ((await getMeta('contract')) !== address) {
    await resetEvents(`contract mới ${address}`);
    await setMeta('contract', address);
  }

  // Ganache / Hardhat node khởi động lại => chain mới: block cũ không còn hoặc hash khác
  const lastBlock = await getMeta('lastBlock');
  let from = lastBlock == null ? 0 : Number(lastBlock) + 1;
  if (lastBlock != null) {
    const block = await provider.getBlock(Number(lastBlock));
    if (!block || block.hash !== (await getMeta('lastBlockHash'))) {
      await resetEvents('blockchain đã bị reset');
      from = 0;
    }
  }

  const latest = await provider.getBlockNumber();
  const touched = new Set(); // hợp đồng có sự kiện mới -> đồng bộ lại bảng leases
  const parties = new Map(); // leaseId -> { landlord, tenant }
  const blockTimes = new Map();

  while (from <= latest) {
    const to = Math.min(latest, from + MAX_RANGE - 1);
    const events = await rental.queryFilter('*', from, to);
    for (const ev of events) {
      const spec = ev.fragment && LEASE_EVENTS[ev.fragment.name];
      if (!spec) continue; // Withdrawn: không gắn với hợp đồng (vẫn xem được trong lịch sử trên chain)
      const data = argsToJson(ev);
      const leaseId = Number(data.leaseId);
      touched.add(leaseId);
      if (!parties.has(leaseId)) {
        const l = await rental.getLease(leaseId);
        parties.set(leaseId, { landlord: l.landlord.toLowerCase(), tenant: l.tenant.toLowerCase() });
      }
      if (!blockTimes.has(ev.blockNumber)) blockTimes.set(ev.blockNumber, (await ev.getBlock()).timestamp);
      const { landlord, tenant } = parties.get(leaseId);
      await query(INSERT_EVENT, [
        leaseId,
        ev.fragment.name,
        landlord,
        tenant,
        spec.actor ? data[spec.actor].toLowerCase() : null,
        spec.amount ? data[spec.amount] : '0',
        JSON.stringify(data),
        ev.blockNumber,
        ev.transactionHash,
        ev.index,
        blockTimes.get(ev.blockNumber),
        data.billId == null ? null : Number(data.billId),
      ]);
    }
    await syncLeases(rental, [...touched]);
    await syncBillPayments();
    touched.clear();
    const toBlock = await provider.getBlock(to);
    await setMeta('lastBlock', to);
    await setMeta('lastBlockHash', toBlock.hash);
    from = to + 1;
  }
}

function startIndexer() {
  const tick = async () => {
    try {
      await syncOnce();
      if (lastError) console.log('[indexer] Đã kết nối lại blockchain');
      lastError = null;
    } catch (err) {
      const msg = err.shortMessage || err.message;
      if (msg !== lastError) console.warn(`[indexer] Lỗi đồng bộ: ${msg}`);
      lastError = msg;
    } finally {
      setTimeout(tick, POLL_MS);
    }
  };
  tick();
}

async function indexerStatus() {
  const lastBlock = await getMeta('lastBlock');
  return {
    contract: await getMeta('contract'),
    chainId,
    lastBlock: lastBlock == null ? null : Number(lastBlock),
    error: lastError,
  };
}

/** Contract (chỉ đọc) để API kiểm tra dữ liệu trên chain, null nếu chưa deploy. */
function getContract() {
  return loadDeployment();
}

module.exports = { startIndexer, indexerStatus, getContract };
