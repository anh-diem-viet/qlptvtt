import { AbiCoder, BrowserProvider, Contract, JsonRpcProvider, formatEther } from 'ethers'
// File này được sinh ra bởi `npm run deploy:ganache` trong smart-contract/
import deployment from '../contracts/RentalManager.json'

export const STATUS = { Pending: 0, Active: 1, Ended: 2, Cancelled: 3 }
export const STATUS_LABEL = ['Chờ ký', 'Đang thuê', 'Đã kết thúc', 'Đã huỷ']
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const MAX_PERIODS = 240 // khớp với contract

/** Độ dài kỳ thanh toán chọn sẵn khi tạo hợp đồng (giây). Kỳ ngắn dùng để demo. */
export const PERIOD_OPTIONS = [
  { seconds: 30 * 86400, label: '30 ngày (1 tháng)' },
  { seconds: 7 * 86400, label: '7 ngày (1 tuần)' },
  { seconds: 86400, label: '1 ngày' },
  { seconds: 300, label: '5 phút (demo)' },
  { seconds: 60, label: '1 phút (demo)' },
]

// Mạng được chọn lúc deploy (Ganache hoặc Hardhat); VITE_RPC_URL dùng để ghi đè nếu cần
const RPC_URL = import.meta.env.VITE_RPC_URL || deployment.rpcUrl || 'http://127.0.0.1:7545'
export const NETWORK_LABEL = deployment.networkLabel || 'Ganache Local'
export const CONTRACT_ADDRESS = deployment.address

// Đọc dữ liệu trực tiếp từ node (nhanh, không phụ thuộc MetaMask)
export const readProvider = new JsonRpcProvider(RPC_URL, deployment.chainId, { staticNetwork: true })
export const readContract = new Contract(deployment.address, deployment.abi, readProvider)

export function sameAddress(a, b) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

export function shortAddress(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}

/** wei -> "0.35" (bỏ số 0 thừa). */
export function fmtEth(wei, digits = 4) {
  if (wei == null) return '…'
  return Number(formatEther(wei)).toFixed(digits).replace(/\.?0+$/, '') || '0'
}

export function toLease(id, raw) {
  return {
    id: Number(id),
    landlord: raw.landlord,
    tenant: raw.tenant,
    roomName: raw.roomName,
    rent: raw.rent,
    deposit: raw.deposit,
    periodLength: Number(raw.periodLength),
    totalPeriods: Number(raw.totalPeriods),
    paidPeriods: Number(raw.paidPeriods),
    createdAt: Number(raw.createdAt),
    startDate: Number(raw.startDate),
    status: Number(raw.status),
    extensionPeriods: Number(raw.extensionPeriods),
    extensionBy: raw.extensionBy,
    depositDeducted: raw.depositDeducted,
    endNote: raw.endNote,
  }
}

/**
 * Tính lịch thanh toán tại thời điểm `now` (giờ của blockchain, giây) — cùng công thức với contract.
 * Tiền thuê trả đầu kỳ: kỳ thứ i (0, 1, 2…) đến hạn lúc startDate + i * periodLength.
 */
export function leaseSchedule(l, now) {
  if (l.status !== STATUS.Active && l.status !== STATUS.Ended) return null
  const endDate = l.startDate + l.totalPeriods * l.periodLength
  const paidUntil = l.startDate + l.paidPeriods * l.periodLength
  const elapsed = Math.max(0, now - l.startDate)
  const dueCount = Math.min(l.totalPeriods, Math.floor(elapsed / l.periodLength) + 1)
  const overdue = l.status === STATUS.Active ? Math.max(0, dueCount - l.paidPeriods) : 0
  const remaining = l.totalPeriods - l.paidPeriods
  // Trả trước tối đa tới kỳ bắt đầu trong vòng 1 kỳ tới (giống điều kiện trong payRent)
  let maxPayable = 0
  while (
    maxPayable < remaining &&
    l.startDate + (l.paidPeriods + maxPayable) * l.periodLength <= now + l.periodLength
  ) {
    maxPayable++
  }
  const expired = now >= endDate
  return {
    endDate,
    paidUntil,
    dueCount,
    overdue,
    remaining,
    maxPayable: l.status === STATUS.Active ? maxPayable : 0,
    nextDueDate: remaining > 0 ? paidUntil : null,
    expired,
    canEvict: l.status === STATUS.Active && !expired && overdue >= 2,
    canEnd: l.status === STATUS.Active && (expired || overdue >= 2),
    claimAt: endDate + l.periodLength,
    canClaim: l.status === STATUS.Active && remaining === 0 && now >= endDate + l.periodLength,
  }
}

/** 2592000 -> "30 ngày", 300 -> "5 phút". */
export function formatPeriod(seconds) {
  if (seconds % 86400 === 0) return `${seconds / 86400} ngày`
  if (seconds % 3600 === 0) return `${seconds / 3600} giờ`
  if (seconds % 60 === 0) return `${seconds / 60} phút`
  return `${seconds} giây`
}

/** Khoảng thời gian còn lại dạng ngắn: "3 ngày 4 giờ", "4:05". */
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d} ngày ${h} giờ`
  if (h > 0) return `${h} giờ ${m} phút`
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function fmtDate(ts, withSeconds = false) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

async function ensureChain() {
  const chainId = '0x' + deployment.chainId.toString(16)
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (err) {
    if (err.code !== 4902) throw err
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: NETWORK_LABEL,
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        },
      ],
    })
  }
}

/** Link cài MetaMask phù hợp trình duyệt đang dùng. */
export function metaMaskInstallLink() {
  const ua = navigator.userAgent
  if (/Firefox\//.test(ua)) {
    return { url: 'https://addons.mozilla.org/firefox/addon/ether-metamask/', store: 'Firefox Add-ons' }
  }
  if (/Edg\//.test(ua)) {
    return {
      url: 'https://microsoftedge.microsoft.com/addons/detail/metamask/ejbalbakoplchlghecdalmeeeajnimhm',
      store: 'Edge Add-ons',
    }
  }
  if (/Chrome\//.test(ua)) {
    // Chrome, Brave, Cốc Cốc, Opera đều cài được từ Chrome Web Store
    return {
      url: 'https://chromewebstore.google.com/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn',
      store: 'Chrome Web Store',
    }
  }
  return { url: 'https://metamask.io/download/', store: 'metamask.io' }
}

export class MetaMaskMissingError extends Error {
  constructor() {
    super('Chưa cài MetaMask')
    this.code = 'METAMASK_MISSING'
  }
}

export async function connectWallet() {
  if (!window.ethereum) throw new MetaMaskMissingError()
  await window.ethereum.request({ method: 'eth_requestAccounts' })
  await ensureChain()
  const signer = await new BrowserProvider(window.ethereum).getSigner()
  return {
    signer,
    address: await signer.getAddress(),
    contract: new Contract(deployment.address, deployment.abi, signer),
  }
}

/** Thông báo revert của contract (không dấu) -> tiếng Việt có dấu để hiện cho người dùng. */
const REVERT_MESSAGES = {
  'Hop dong khong ton tai': 'Hợp đồng không tồn tại',
  'Dia chi nguoi thue khong hop le': 'Địa chỉ người thuê không hợp lệ',
  'Chu nha khong the tu thue phong cua minh': 'Chủ nhà không thể tự thuê phòng của mình',
  'Ten phong dai 1-100 byte': 'Tên phòng phải từ 1 đến 100 byte',
  'Tien thue phai lon hon 0': 'Tiền thuê phải lớn hơn 0',
  'Do dai ky khong hop le': 'Độ dài kỳ thanh toán không hợp lệ',
  'So ky thue khong hop le': 'Số kỳ thuê không hợp lệ (1–240)',
  'Chi huy duoc hop dong chua ky': 'Chỉ huỷ được hợp đồng chưa ký',
  'Ban khong thuoc hop dong nay': 'Bạn không thuộc hợp đồng này',
  'Hop dong khong o trang thai cho ky': 'Hợp đồng không ở trạng thái chờ ký',
  'Chi nguoi thue duoc ky hop dong': 'Chỉ người thuê được ký hợp đồng',
  'Phai gui dung tien coc + tien thue ky dau': 'Phải gửi đúng tiền cọc + tiền thuê kỳ đầu',
  'Hop dong khong hieu luc': 'Hợp đồng không còn hiệu lực',
  'Chi nguoi thue duoc tra tien thue': 'Chỉ người thuê được trả tiền thuê',
  'So ky phai lon hon 0': 'Số kỳ phải lớn hơn 0',
  'Vuot qua so ky cua hop dong': 'Vượt quá số kỳ của hợp đồng',
  'So tien khong dung': 'Số tiền không đúng',
  'Chi duoc tra truoc toi da 1 ky': 'Chỉ được trả trước tối đa 1 kỳ',
  'Hop dong da het han': 'Hợp đồng đã hết hạn',
  'So ky gia han khong hop le': 'Số kỳ gia hạn không hợp lệ',
  'Khong co de xuat gia han': 'Không có đề xuất gia hạn',
  'Ben con lai moi duoc chap nhan': 'Bên còn lại mới được chấp nhận',
  'Chi chu nha duoc ket thuc hop dong': 'Chỉ chủ nhà được kết thúc hợp đồng',
  'Khau tru vuot qua tien coc': 'Khấu trừ vượt quá tiền cọc',
  'Phai ghi ly do khau tru': 'Phải ghi lý do khấu trừ',
  'Ly do toi da 200 byte': 'Lý do tối đa 200 byte',
  'Hop dong chua het han va nguoi thue khong no qua 1 ky': 'Hợp đồng chưa hết hạn và người thuê không nợ quá 1 kỳ',
  'Chi nguoi thue duoc cham dut som': 'Chỉ người thuê được chấm dứt sớm',
  'Hop dong da het han, hay cho chu nha quyet toan': 'Hợp đồng đã hết hạn, hãy chờ chủ nhà quyết toán',
  'Chi nguoi thue duoc nhan lai coc': 'Chỉ người thuê được nhận lại cọc',
  'Con no tien thue, khong the tu nhan coc': 'Còn nợ tiền thuê, không thể tự nhận cọc',
  'Chua qua thoi han quyet toan cua chu nha': 'Chưa qua thời hạn quyết toán của chủ nhà',
  'So tien rut phai lon hon 0': 'Số tiền rút phải lớn hơn 0',
  'So du khong du': 'Số dư không đủ',
  'Chuyen tien that bai': 'Chuyển tiền thất bại',
  'Chi chu nha duoc phat hanh hoa don': 'Chỉ chủ nhà được phát hành hoá đơn',
  'So tien hoa don phai lon hon 0': 'Số tiền hoá đơn phải lớn hơn 0',
  'Noi dung hoa don dai 1-200 byte': 'Nội dung hoá đơn dài 1–200 byte',
  'Hoa don khong ton tai': 'Hoá đơn không tồn tại',
  'Chi nguoi thue duoc tra hoa don': 'Chỉ người thuê được trả hoá đơn',
  'Hoa don da bi huy': 'Hoá đơn đã bị huỷ',
  'Hoa don da duoc thanh toan': 'Hoá đơn đã được thanh toán',
  'Chi chu nha duoc huy hoa don': 'Chỉ chủ nhà được huỷ hoá đơn',
}

/**
 * Tìm lý do revert của contract trong lỗi. Tuỳ node (Hardhat/Ganache) và ví (MetaMask bọc thêm lớp
 * "Internal JSON-RPC error"), lý do nằm ở các chỗ khác nhau nên duyệt qua các lớp lồng nhau.
 */
function findRevertReason(err, depth = 0) {
  if (!err || typeof err !== 'object' || depth > 5) return null
  if (typeof err.reason === 'string' && err.reason && err.reason !== 'revert') return err.reason
  for (const value of [err.data, err.result]) {
    if (typeof value === 'string' && value.startsWith('0x08c379a0')) {
      try {
        return AbiCoder.defaultAbiCoder().decode(['string'], `0x${value.slice(10)}`)[0]
      } catch {
        // dữ liệu không đúng định dạng Error(string)
      }
    }
  }
  for (const child of [err.info?.error, err.error, err.data, err.cause]) {
    const found = findRevertReason(child, depth + 1)
    if (found) return found
  }
  // Chỉ nhận đúng mẫu thông báo revert của node (tránh khớp nhầm "missing revert data" của ethers)
  const m = /(?:VM Exception while processing transaction: revert|execution reverted:|reverted with reason string) '?(.+?)'?$/.exec(
    typeof err.message === 'string' ? err.message : '',
  )
  return m ? m[1] : null
}

export function errorMessage(err) {
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) return 'Bạn đã huỷ giao dịch'
  const reason = findRevertReason(err)
  if (reason) return REVERT_MESSAGES[reason] || reason
  return err?.shortMessage || err?.message || String(err)
}

/** Loại giao dịch trong lịch sử, khớp enum TxType của contract. sign: +1 tiền vào, -1 tiền ra. */
export const TX_TYPES = [
  { icon: '🔒', label: 'Đặt cọc', sign: -1 },
  { icon: '💸', label: 'Trả tiền thuê', sign: -1 },
  { icon: '💰', label: 'Nhận tiền thuê', sign: 1 },
  { icon: '↩️', label: 'Nhận lại cọc', sign: 1 },
  { icon: '🏦', label: 'Nhận tiền cọc khấu trừ', sign: 1 },
  { icon: '📤', label: 'Rút về ví', sign: -1 },
  { icon: '🧾', label: 'Trả hoá đơn dịch vụ', sign: -1 },
  { icon: '🧾', label: 'Nhận tiền hoá đơn dịch vụ', sign: 1 },
]
