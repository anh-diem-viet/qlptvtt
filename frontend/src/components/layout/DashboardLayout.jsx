import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useApp } from '../../store/useApp'
import { shortAddress } from '../../lib/rental'
import { Button } from '../common/ui'
import Header from './Header'
import Sidebar from './Sidebar'

/** Khung trang: header cố định + sidebar trái + nội dung (theo DashboardLayout của dự án mẫu). */
export default function DashboardLayout() {
  const [open, setOpen] = useState(false)
  const { user, wallet, busy, linkCurrentWallet, walletMismatch } = useApp()

  return (
    <div className="min-h-screen">
      <Header onMenuClick={() => setOpen((o) => !o)} />
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="pt-16 lg:pl-64">
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {walletMismatch() && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-gold-300 bg-gold-100 px-4 py-3 text-sm font-semibold text-[#5a3b00]">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
              <span className="flex-1">
                {user.walletAddress
                  ? `Ví đang chọn (${shortAddress(wallet.address)}) khác ví đã liên kết (${shortAddress(user.walletAddress)}). Đổi tài khoản trong MetaMask, hoặc liên kết ví này thay thế.`
                  : 'Ví MetaMask này chưa liên kết với tài khoản. Liên kết để chủ nhà / khách thuê thấy tên của bạn và tìm được bạn.'}
              </span>
              <Button variant="gold" size="sm" onClick={linkCurrentWallet} disabled={busy}>
                🔗 Liên kết ví này
              </Button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
