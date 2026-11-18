// Trạng thái toàn ứng dụng (Zustand): phiên đăng nhập Google, ví MetaMask, số dư, hợp đồng đọc từ blockchain.
import { create } from 'zustand'
import toast from 'react-hot-toast'
import { api, goToGoogleLogin, linkWallet, loadToken, saveToken, takeAuthResultFromUrl } from '../lib/api'
import { connectWallet, errorMessage, readContract, readProvider, sameAddress, shortAddress, toLease } from '../lib/rental'

const LEASE_LIMIT = 300

// Đọc kết quả Google redirect (#token / #error) một lần khi tải trang
const AUTH_FROM_URL = takeAuthResultFromUrl()
if (AUTH_FROM_URL.token) saveToken(AUTH_FROM_URL.token)

export const useApp = create((set, get) => ({
  token: loadToken(),
  user: null, // { email, name, avatarUrl, nickname, displayName, walletAddress }
  authError: AUTH_FROM_URL.error,
  justLoggedIn: !!AUTH_FROM_URL.token,
  wallet: null, // { signer, address, contract }
  names: {}, // địa chỉ ví (chữ thường) -> tên hiển thị
  balance: null, // số dư có thể rút trong contract
  ethBalance: null,
  leases: [], // tất cả hợp đồng trên contract (mới nhất cuối)
  chainOffset: 0, // giờ blockchain - giờ máy (giây), khác 0 khi demo tua thời gian
  busy: false,
  modal: null, // 'history' | 'nickname' | 'install' | 'guide' | null
  openLeaseId: null,

  setModal: (modal) => set({ modal }),
  openLease: (id) => set({ openLeaseId: id }),

  async loadMe() {
    if (!get().token) return
    try {
      const { user } = await api.get('/me')
      set({ user, modal: get().justLoggedIn && !user.nickname ? 'nickname' : get().modal })
    } catch (err) {
      saveToken(null)
      set({
        token: null,
        user: null,
        authError: err.status === 401 ? 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại' : `Không kết nối được backend: ${err.message}`,
      })
    }
  },

  async logout() {
    await api.post('/auth/logout').catch(() => {})
    saveToken(null)
    set({ token: null, user: null, wallet: null, modal: null, openLeaseId: null })
  },

  async switchGoogleAccount() {
    await get().logout()
    goToGoogleLogin()
  },

  async loadNames() {
    try {
      set({ names: await api.get('/users') })
    } catch {
      // backend tắt: hiển thị địa chỉ rút gọn
    }
  },

  nameOf(addr) {
    return get().names[addr?.toLowerCase()] || shortAddress(addr)
  },

  /** Đọc lại dữ liệu từ blockchain: danh sách hợp đồng, số dư, giờ của chain. */
  async refreshChain() {
    try {
      const [count, block] = await Promise.all([readContract.leaseCount(), readProvider.getBlock('latest')])
      const total = Number(count)
      const start = Math.max(1, total - LEASE_LIMIT + 1)
      const list = total ? await readContract.getLeases(start, LEASE_LIMIT) : []
      const offset = Math.max(0, block.timestamp - Math.floor(Date.now() / 1000))
      const patch = { leases: list.map((raw, i) => toLease(start + i, raw)), chainOffset: offset }
      const { wallet } = get()
      if (wallet) {
        const [eth, bal] = await Promise.all([readProvider.getBalance(wallet.address), readContract.balances(wallet.address)])
        patch.ethBalance = eth
        patch.balance = bal
      }
      set(patch)
    } catch (err) {
      toast.error(`Không đọc được dữ liệu từ blockchain: ${errorMessage(err)}`, { id: 'chain-error' })
    }
  },

  async connect() {
    try {
      set({ wallet: await connectWallet() })
      await get().refreshChain()
    } catch (err) {
      if (err.code === 'METAMASK_MISSING') set({ modal: 'install' })
      else toast.error(errorMessage(err))
    }
  },

  disconnect: () => set({ wallet: null, balance: null, ethBalance: null }),

  async linkCurrentWallet() {
    const { wallet } = get()
    set({ busy: true })
    try {
      const { user } = await linkWallet(wallet.signer)
      set((s) => ({ user, names: { ...s.names, [user.walletAddress.toLowerCase()]: user.displayName } }))
      toast.success(`Đã liên kết ví ${shortAddress(user.walletAddress)} với tài khoản`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      set({ busy: false })
    }
  },

  async saveNickname(nickname) {
    const { user } = await api.put('/me/nickname', { nickname })
    set((s) => ({
      user,
      modal: null,
      names: user.walletAddress ? { ...s.names, [user.walletAddress.toLowerCase()]: user.displayName } : s.names,
    }))
    toast.success(`Xin chào, ${user.nickname}!`)
  },

  /**
   * Gửi giao dịch bằng MetaMask: chờ xác nhận, báo kết quả, đọc lại dữ liệu.
   * Trả về receipt (để đọc sự kiện, vd. id hợp đồng / hoá đơn vừa tạo) hoặc null nếu lỗi.
   */
  async send(successText, makeTx) {
    const { wallet } = get()
    if (!wallet) {
      toast.error('Hãy kết nối ví MetaMask trước')
      return null
    }
    set({ busy: true })
    const id = toast.loading('Đang chờ xác nhận giao dịch…')
    try {
      const tx = await makeTx(wallet.contract)
      const receipt = await tx.wait()
      if (successText) toast.success(successText, { id })
      else toast.dismiss(id)
      await get().refreshChain()
      return receipt
    } catch (err) {
      toast.error(errorMessage(err), { id })
      return null
    } finally {
      set({ busy: false })
    }
  },

  /** Ví đang dùng để xem dữ liệu: ví MetaMask đang chọn, hoặc ví đã liên kết (chỉ xem). */
  viewer() {
    return get().wallet?.address || get().user?.walletAddress || null
  },

  walletMismatch() {
    const { wallet, user } = get()
    return !!wallet && !!user && !sameAddress(user.walletAddress, wallet.address)
  },
}))

/** Đọc sự kiện của contract trong receipt. */
export function eventsOf(receipt) {
  const out = []
  for (const log of receipt?.logs || []) {
    try {
      const ev = readContract.interface.parseLog(log)
      if (ev) out.push(ev)
    } catch {
      // log không thuộc contract
    }
  }
  return out
}
