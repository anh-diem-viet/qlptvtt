import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, MenuButton, MenuItem, MenuItems, Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  BookOpenIcon,
  ClockIcon,
  LinkIcon,
  PencilSquareIcon,
  WalletIcon,
} from '@heroicons/react/24/outline'
import { formatEther, parseEther } from 'ethers'
import { useApp } from '../../store/useApp'
import { fmtEth, sameAddress, shortAddress } from '../../lib/rental'
import { Button } from '../common/ui'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-brand text-xl shadow-brand">🏠</span>
      <span className="leading-tight">
        <span className="block text-lg font-extrabold tracking-tight text-ink">NhàTrọ<span className="text-brand-500">Chain</span></span>
        <span className="hidden text-[11px] font-semibold text-ink-soft sm:block">Hợp đồng thông minh</span>
      </span>
    </Link>
  )
}

function WalletPopover() {
  const { wallet, balance, ethBalance, busy, send, setModal } = useApp()
  const [amount, setAmount] = useState('')
  let value = null
  try {
    value = parseEther(amount || '0')
  } catch {
    // số tiền không hợp lệ
  }
  const valid = value != null && value > 0n && balance != null && value <= balance

  return (
    <Popover className="relative">
      <PopoverButton className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gold-300 bg-gold-100 px-3 py-2 text-sm font-bold tabular-nums text-[#5a3b00] shadow-sm hover:brightness-105">
        💰 {fmtEth(balance)} ETH
      </PopoverButton>
      <PopoverPanel anchor="bottom end" className="z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        {({ close }) => (
          <div className="space-y-3">
            <p className="text-sm font-bold text-ink">Số dư trong smart contract</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-ink-soft">Có thể rút</span><b className="tabular-nums">{fmtEth(balance, 6)} ETH</b></div>
              <div className="flex justify-between"><span className="text-ink-soft">Ví MetaMask</span><b className="tabular-nums">{fmtEth(ethBalance)} ETH</b></div>
              <div className="flex justify-between"><span className="text-ink-soft">Địa chỉ</span><code className="text-xs">{shortAddress(wallet.address)}</code></div>
            </div>
            <p className="text-xs text-ink-soft">Tiền thuê, tiền hoá đơn nhận được, tiền cọc được hoàn… nằm trong contract tới khi bạn rút về MetaMask.</p>
            <div className="flex gap-2">
              <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Số ETH muốn rút" aria-label="Số ETH muốn rút" />
              <Button variant="secondary" size="sm" onClick={() => setAmount(balance ? formatEther(balance) : '0')} disabled={!balance}>
                Rút hết
              </Button>
            </div>
            <Button
              variant="gold"
              className="w-full"
              disabled={busy || !valid}
              onClick={async () => {
                if (await send(`Đã rút ${fmtEth(value, 6)} ETH về MetaMask`, (c) => c.withdraw(value))) {
                  setAmount('')
                  close()
                }
              }}
            >
              📤 Rút về MetaMask
            </Button>
            <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-300 py-2 text-xs font-bold text-brand-600 hover:bg-brand-50" onClick={() => { close(); setModal('history') }}>
              <ClockIcon className="h-4 w-4" /> Lịch sử giao dịch trên blockchain
            </button>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  )
}

function AccountMenu() {
  const { user, wallet, busy, connect, linkCurrentWallet, setModal, switchGoogleAccount, logout } = useApp()
  const canLink = wallet && !sameAddress(user.walletAddress, wallet.address)
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink data-[focus]:bg-brand-50'
  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center gap-2 rounded-full bg-gradient-brand py-1 pl-1 pr-3 text-sm font-bold text-white shadow-brand" title={user.email}>
        <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border-2 border-white bg-brand-600">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : user.displayName[0].toUpperCase()}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:block">{user.displayName}</span>
      </MenuButton>
      <MenuItems anchor="bottom end" className="z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl focus:outline-none">
        <div className="mb-1 border-b border-slate-100 px-3 pb-2 pt-1">
          <p className="font-bold text-ink">{user.displayName}</p>
          <p className="text-xs text-ink-soft">{user.email}</p>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            {user.walletAddress ? <>🔗 Ví liên kết: <code>{shortAddress(user.walletAddress)}</code></> : 'Chưa liên kết ví MetaMask'}
          </p>
        </div>
        {canLink && (
          <MenuItem>
            <button className={item} onClick={linkCurrentWallet} disabled={busy}><LinkIcon className="h-4 w-4" /> Liên kết ví đang chọn ({shortAddress(wallet.address)})</button>
          </MenuItem>
        )}
        {!wallet && (
          <MenuItem>
            <button className={item} onClick={connect}><WalletIcon className="h-4 w-4" /> Kết nối ví MetaMask</button>
          </MenuItem>
        )}
        <MenuItem>
          <button className={item} onClick={() => setModal('history')}><ClockIcon className="h-4 w-4" /> Lịch sử giao dịch</button>
        </MenuItem>
        <MenuItem>
          <button className={item} onClick={() => setModal('nickname')}><PencilSquareIcon className="h-4 w-4" /> {user.nickname ? 'Đổi nickname' : 'Đặt nickname'}</button>
        </MenuItem>
        <MenuItem>
          <button className={item} onClick={() => setModal('guide')}><BookOpenIcon className="h-4 w-4" /> Hướng dẫn sử dụng</button>
        </MenuItem>
        <MenuItem>
          <button className={item} onClick={switchGoogleAccount}><ArrowPathIcon className="h-4 w-4" /> Đổi tài khoản Google</button>
        </MenuItem>
        <MenuItem>
          <button className={`${item} text-red-600`} onClick={logout}><ArrowRightOnRectangleIcon className="h-4 w-4" /> Đăng xuất</button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}

export default function Header({ onMenuClick }) {
  const { wallet, busy, connect } = useApp()
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button className="rounded-lg p-2 text-ink-soft hover:bg-slate-100 lg:hidden" onClick={onMenuClick} aria-label="Mở menu">
            <Bars3Icon className="h-6 w-6" />
          </button>
          <Logo />
        </div>
        <div className="flex items-center gap-2">
          {wallet ? (
            <WalletPopover />
          ) : (
            <Button variant="gold" size="sm" onClick={connect} disabled={busy} leftIcon={WalletIcon}>
              Kết nối ví
            </Button>
          )}
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
