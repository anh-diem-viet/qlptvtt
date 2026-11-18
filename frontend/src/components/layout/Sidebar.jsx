import { NavLink } from 'react-router-dom'
import {
  BanknotesIcon,
  BoltIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  HomeModernIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  ReceiptPercentIcon,
  Squares2X2Icon,
  UsersIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

// Menu chia theo vai trò; một tài khoản có thể vừa cho thuê vừa đi thuê
export const MENU = [
  {
    group: 'Chủ nhà',
    items: [
      { to: '/tong-quan', label: 'Tổng quan', icon: Squares2X2Icon },
      { to: '/phong', label: 'Phòng trọ', icon: HomeModernIcon },
      { to: '/khach-thue', label: 'Khách thuê', icon: UsersIcon },
      { to: '/hop-dong', label: 'Hợp đồng', icon: DocumentTextIcon },
      { to: '/dien-nuoc', label: 'Chỉ số điện nước', icon: BoltIcon },
      { to: '/hoa-don', label: 'Hoá đơn', icon: ReceiptPercentIcon },
      { to: '/thu-chi', label: 'Thu chi', icon: BanknotesIcon },
      { to: '/dich-vu', label: 'Dịch vụ & đơn giá', icon: WrenchScrewdriverIcon },
    ],
  },
  {
    group: 'Người thuê',
    items: [
      { to: '/tim-phong', label: 'Tìm phòng', icon: MagnifyingGlassIcon },
      { to: '/phong-cua-toi', label: 'Phòng đang thuê', icon: KeyIcon },
      { to: '/hoa-don-cua-toi', label: 'Hoá đơn của tôi', icon: ClipboardDocumentListIcon },
    ],
  },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={onClose} />}
      <aside
        className={clsx(
          'fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 border-r border-slate-200 bg-white/95 backdrop-blur transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-full flex-col">
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {MENU.map((section) => (
              <div key={section.group}>
                <p className="mb-1.5 px-3 text-[11px] font-extrabold uppercase tracking-widest text-ink-soft/70">{section.group}</p>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150',
                            isActive ? 'bg-gradient-brand text-white shadow-brand' : 'text-ink-soft hover:bg-brand-50 hover:text-brand-700',
                          )
                        }
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-slate-100 p-4 text-center text-xs text-ink-soft">
            © 2026 Nhà Trọ · Hợp đồng thông minh
          </div>
        </div>
      </aside>
    </>
  )
}
