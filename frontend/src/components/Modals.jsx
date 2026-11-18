// Các hộp thoại chung: lịch sử giao dịch, nickname, cài MetaMask, hướng dẫn
import { useEffect, useState } from 'react'
import { formatEther } from 'ethers'
import { useApp } from '../store/useApp'
import { TX_TYPES, ZERO_ADDRESS, errorMessage, fmtDate, metaMaskInstallLink, readContract } from '../lib/rental'
import { Button, EmptyState, Field, Loading, Modal } from './common/ui'
import { ClockIcon } from '@heroicons/react/24/outline'

const HISTORY_LIMIT = 100

/** Lịch sử giao dịch đọc trực tiếp từ smart contract (getHistory). */
function TxHistory({ onClose }) {
  const { wallet, nameOf } = useApp()
  const me = wallet?.address
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!me) return undefined
    let alive = true
    const load = async () => {
      try {
        const count = Number(await readContract.getHistoryCount(me))
        const start = Math.max(0, count - HISTORY_LIMIT)
        const list = count ? await readContract.getHistory(me, start, HISTORY_LIMIT) : []
        if (!alive) return
        setTotal(count)
        setRows(list.map((t, i) => ({ no: start + i + 1, type: Number(t.txType), leaseId: Number(t.leaseId), counterparty: t.counterparty, amount: t.amount, timestamp: Number(t.timestamp) })).reverse())
      } catch (err) {
        if (alive) setError(errorMessage(err))
      }
    }
    load()
    const id = setInterval(load, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [me])

  return (
    <Modal open onClose={onClose} title="📜 Lịch sử giao dịch trên blockchain" size="lg">
      {!me ? (
        <EmptyState icon={ClockIcon} title="Chưa kết nối ví">Kết nối ví MetaMask để xem lịch sử giao dịch.</EmptyState>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            Mọi khoản đặt cọc, tiền phòng, hoá đơn, hoàn cọc và rút tiền đều được smart contract ghi lại
            {total > 0 && ` · ${total} giao dịch${total > HISTORY_LIMIT ? `, hiện ${HISTORY_LIMIT} gần nhất` : ''}`}.
          </p>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          {rows == null ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState icon={ClockIcon} title="Chưa có giao dịch nào" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((t) => {
                const meta = TX_TYPES[t.type] || { icon: '•', label: `Loại ${t.type}`, sign: 0 }
                const details = []
                if (t.leaseId) details.push(`hợp đồng #${t.leaseId}`)
                if (t.counterparty !== ZERO_ADDRESS) details.push(`${meta.sign > 0 ? 'từ' : 'cho'} ${nameOf(t.counterparty)}`)
                details.push(fmtDate(t.timestamp, true))
                return (
                  <li key={t.no} className="flex items-center gap-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg">{meta.icon}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-sm">{meta.label}</b>
                      <span className="block truncate text-xs text-ink-soft">{details.join(' · ')}</span>
                    </span>
                    <span className={`font-extrabold tabular-nums ${meta.sign > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {meta.sign > 0 ? '+' : '−'}
                      {formatEther(t.amount)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}

function NicknameDialog({ onClose }) {
  const { user, saveNickname } = useApp()
  const [value, setValue] = useState(user.nickname || '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  return (
    <Modal open onClose={onClose} title={user.nickname ? 'Đổi nickname' : 'Chọn nickname'} size="sm">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          setError(null)
          try {
            await saveNickname(value.trim())
          } catch (err) {
            setError(err.message)
          } finally {
            setSaving(false)
          }
        }}
      >
        <p className="text-sm text-ink-soft">Nickname hiện trong hợp đồng thay cho địa chỉ ví; chủ nhà có thể nhập nickname của bạn khi tạo hợp đồng.</p>
        <Field label="Nickname" hint="3–20 ký tự: chữ, số, dấu gạch dưới." error={error}>
          <input className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="vd. ChuNha_LanAnh" maxLength={20} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Để sau</Button>
          <Button type="submit" loading={saving}>Lưu</Button>
        </div>
      </form>
    </Modal>
  )
}

function InstallMetaMask({ onClose }) {
  const { url, store } = metaMaskInstallLink()
  return (
    <Modal open onClose={onClose} title="🦊 Chưa cài MetaMask" size="sm">
      <div className="space-y-4 text-sm">
        <p>Cần ví <b>MetaMask</b> để tạo hợp đồng, ký hợp đồng, đặt cọc và thanh toán. Cài tiện ích từ <b>{store}</b> rồi quay lại trang này.</p>
        <a className="block rounded-lg bg-gradient-brand px-4 py-2.5 text-center font-bold text-white shadow-brand" href={url} target="_blank" rel="noopener noreferrer">
          Cài MetaMask từ {store} ↗
        </a>
        <ul className="list-disc space-y-1 pl-5 text-ink-soft">
          <li>Sau khi cài, tạo ví mới hoặc nhập private key tài khoản Ganache (xem README).</li>
          <li>Quay lại tab này và tải lại trang.</li>
        </ul>
        <Button variant="secondary" className="w-full" onClick={() => window.location.reload()}>🔄 Tôi đã cài xong — tải lại trang</Button>
      </div>
    </Modal>
  )
}

const GUIDE = [
  ['1. Khách tìm phòng', ['Người thuê vào “Tìm phòng”, xem phòng trống (diện tích, giá, tiền cọc, thiết bị) và gửi yêu cầu thuê kèm lời nhắn.']],
  ['2. Xem phòng & thoả thuận', ['Chủ nhà xem yêu cầu ở trang “Phòng trọ”, hẹn xem phòng, rồi bấm “Tạo hợp đồng” cho đúng khách.']],
  ['3. Ký hợp đồng & thu cọc', ['Hợp đồng được tạo trên smart contract. Khách ký = gửi tiền cọc + tiền phòng kỳ đầu trong 1 giao dịch.', 'Phòng tự chuyển trạng thái “Đã thuê”, hồ sơ khách được tạo.']],
  ['4. Quản lý hằng tháng', ['Ghi chỉ số điện, nước (chỉ số mới tháng trước tự thành chỉ số cũ tháng này, nhập sai sẽ bị chặn).', 'Tạo hoá đơn: tiền phòng + dịch vụ (điện, nước, internet, rác, gửi xe). Đầu tháng hệ thống tự tạo hoá đơn tháng trước.', 'Phát hành hoá đơn lên blockchain để khách thanh toán.']],
  ['5. Thanh toán & ghi nhận', ['Khách trả hoá đơn bằng ví: tiền vào số dư của chủ nhà, phiếu thu tự được ghi, kỳ tiền phòng được cộng vào hợp đồng.', 'Thu tiền mặt / chuyển khoản thì chủ nhà ghi phiếu thu tay. Công nợ & doanh thu xem ở “Tổng quan”, “Thu chi”.']],
  ['6. Kết thúc hợp đồng / trả phòng', ['Hết hạn: chủ nhà quyết toán cọc — hoàn lại, hoặc khấu trừ kèm lý do (hư hỏng thiết bị, nợ tiền).', 'Khách nợ quá 1 kỳ: chủ nhà được chấm dứt sớm. Khách trả phòng sớm: mất cọc.', 'Chủ nhà không quyết toán quá 1 kỳ sau hạn: khách tự nhận lại toàn bộ cọc. Phòng trở về “Trống”.']],
]

function GuideModal({ onClose }) {
  return (
    <Modal open onClose={onClose} title="📖 Hướng dẫn — luồng quản lý nhà trọ" size="lg">
      <div className="space-y-4">
        {GUIDE.map(([title, lines]) => (
          <section key={title}>
            <h4 className="mb-1 font-bold text-ink">{title}</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </section>
        ))}
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Demo nhanh: chọn kỳ thanh toán <b>1 phút</b> hoặc <b>5 phút</b> khi tạo hợp đồng.</p>
      </div>
    </Modal>
  )
}

export default function GlobalModals() {
  const { modal, setModal, user } = useApp()
  const close = () => setModal(null)
  if (modal === 'history') return <TxHistory onClose={close} />
  if (modal === 'nickname' && user) return <NicknameDialog onClose={close} />
  if (modal === 'install') return <InstallMetaMask onClose={close} />
  if (modal === 'guide') return <GuideModal onClose={close} />
  return null
}
