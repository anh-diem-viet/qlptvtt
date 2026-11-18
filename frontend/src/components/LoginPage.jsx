import { useEffect, useState } from 'react'
import { BanknotesIcon, DocumentTextIcon, HomeModernIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { api, goToGoogleLogin } from '../lib/api'
import { useApp } from '../store/useApp'
import { Card } from './common/ui'
import { Logo } from './layout/Header'

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

const FEATURES = [
  { icon: HomeModernIcon, title: 'Quản lý phòng & khách', text: 'Danh sách phòng, hồ sơ khách thuê, thiết bị trong phòng' },
  { icon: DocumentTextIcon, title: 'Hợp đồng trên blockchain', text: 'Ký hợp đồng, đặt cọc, gia hạn bằng smart contract' },
  { icon: BanknotesIcon, title: 'Hoá đơn hằng tháng', text: 'Chỉ số điện nước, tiền phòng + dịch vụ, thanh toán bằng ví' },
  { icon: ShieldCheckIcon, title: 'Minh bạch tiền cọc', text: 'Contract giữ cọc, hoàn / khấu trừ có ghi lý do' },
]

export default function LoginPage() {
  const error = useApp((s) => s.authError)
  const [configured, setConfigured] = useState(null)

  useEffect(() => {
    api
      .get('/auth/config')
      .then((c) => setConfigured(c.googleConfigured))
      .catch(() => setConfigured(false))
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Logo />
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
            Quản lý nhà trọ & thanh toán tiền thuê bằng <span className="bg-gradient-brand bg-clip-text text-transparent">hợp đồng thông minh</span>
          </h1>
          <p className="text-ink-soft">
            Chủ nhà tạo hợp đồng thuê, người thuê đặt cọc và thanh toán, hai bên gia hạn và quyết toán tiền cọc minh bạch trên blockchain.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3 rounded-xl bg-white/70 p-3">
                <f.icon className="h-6 w-6 shrink-0 text-brand-500" />
                <div>
                  <p className="text-sm font-bold text-ink">{f.title}</p>
                  <p className="text-xs text-ink-soft">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Card padding="lg" className="mx-auto w-full max-w-md space-y-5 text-center">
          <div>
            <h2 className="text-xl font-extrabold text-ink">Đăng nhập</h2>
            <p className="text-sm text-ink-soft">Dùng tài khoản Google, sau đó liên kết ví MetaMask</p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">⚠️ {error}</p>}
          <button
            onClick={goToGoogleLogin}
            disabled={configured === false}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white font-bold text-slate-700 shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GoogleIcon /> Đăng nhập bằng Google
          </button>
          {configured === false && (
            <p className="text-xs font-semibold text-red-600">
              Backend chưa cấu hình đăng nhập Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trong backend/.env), hoặc backend chưa chạy.
            </p>
          )}
          <p className="text-xs text-ink-soft">Một tài khoản dùng được cho cả hai vai trò: chủ nhà cho thuê phòng và người đi thuê.</p>
        </Card>
      </div>
    </div>
  )
}
