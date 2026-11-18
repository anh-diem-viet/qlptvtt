// Gọi backend bằng axios (Vite proxy /api -> http://localhost:4000), tự gắn token đăng nhập
import axios from 'axios'

const TOKEN_KEY = 'nhatro.token'

export function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // trình duyệt chặn localStorage: phiên chỉ tồn tại tới khi tải lại trang
  }
}

const client = axios.create({ baseURL: '/api', timeout: 20000 })

client.interceptors.request.use((config) => {
  const token = loadToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res.data,
  (error) => {
    const status = error.response?.status
    const err = new Error(error.response?.data?.message || (status ? `Lỗi máy chủ (HTTP ${status})` : 'Không kết nối được backend'))
    err.status = status
    return Promise.reject(err)
  },
)

export const api = {
  get: (url, params) => client.get(url, { params }),
  post: (url, body) => client.post(url, body),
  put: (url, body) => client.put(url, body),
  del: (url) => client.delete(url),
}

/** Google redirect về /#token=... hoặc /#error=...; đọc rồi xoá khỏi thanh địa chỉ. */
export function takeAuthResultFromUrl() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const token = params.get('token')
  const error = params.get('error')
  if (token || error) window.history.replaceState(null, '', window.location.pathname)
  return { token, error }
}

/** Chuyển sang trang chọn tài khoản Google (dùng cho cả đăng nhập lẫn đổi tài khoản). */
export function goToGoogleLogin() {
  window.location.href = '/api/auth/google'
}

/** Liên kết ví MetaMask vào tài khoản: lấy message -> ký bằng ví -> backend kiểm tra chữ ký. */
export async function linkWallet(signer) {
  const address = await signer.getAddress()
  const { message } = await api.get('/wallet/nonce', { address })
  const signature = await signer.signMessage(message)
  return api.post('/wallet/link', { signature })
}
