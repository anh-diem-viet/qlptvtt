import { useState } from 'react'
import { formatEther, isAddress, parseEther } from 'ethers'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import { MAX_PERIODS, PERIOD_OPTIONS, fmtEth, formatPeriod, sameAddress, shortAddress } from '../../lib/rental'
import { eventsOf, useApp } from '../../store/useApp'
import { Button, Field, Modal } from '../common/ui'

function toWei(v) {
  try {
    return parseEther(v || '0')
  } catch {
    return null
  }
}

/**
 * Ký hợp đồng cho một phòng: tạo hợp đồng trên smart contract (createLease) rồi gắn với phòng ở backend.
 * Người thuê chọn từ yêu cầu thuê / hồ sơ khách có ví, hoặc nhập nickname / địa chỉ ví.
 */
export default function CreateLeaseModal({ room, candidates = [], onClose, onDone }) {
  const { wallet, names, busy, send } = useApp()
  const [tenantInput, setTenantInput] = useState(candidates[0]?.address || '')
  const [roomName, setRoomName] = useState(`${room.code} - ${room.name}`)
  const [rent, setRent] = useState(formatEther(room.priceWei))
  const [deposit, setDeposit] = useState(formatEther(room.depositWei))
  const [period, setPeriod] = useState(PERIOD_OPTIONS[0].seconds)
  const [periods, setPeriods] = useState('12')

  const v = tenantInput.trim()
  let tenant = null
  if (v) {
    if (isAddress(v)) tenant = { address: v, label: names[v.toLowerCase()] || shortAddress(v) }
    else {
      const hit = Object.entries(names).find(([, n]) => n.toLowerCase() === v.toLowerCase())
      tenant = hit ? { address: hit[0], label: hit[1] } : { error: 'Không tìm thấy nickname hoặc địa chỉ ví không hợp lệ' }
    }
  }
  const self = tenant?.address && sameAddress(tenant.address, wallet?.address)
  const rentWei = toWei(rent)
  const depositWei = toWei(deposit)
  const count = Number(periods)
  const nameBytes = new TextEncoder().encode(roomName.trim()).length
  const errors = []
  if (!nameBytes || nameBytes > 100) errors.push('Tên phòng trên hợp đồng 1–100 byte')
  if (rentWei == null || rentWei <= 0n) errors.push('Tiền phòng phải lớn hơn 0')
  if (depositWei == null) errors.push('Tiền cọc không hợp lệ')
  if (!Number.isInteger(count) || count < 1 || count > MAX_PERIODS) errors.push(`Số kỳ từ 1 đến ${MAX_PERIODS}`)
  const valid = !!wallet && tenant?.address && !self && errors.length === 0

  async function submit(e) {
    e.preventDefault()
    if (!valid) return
    const receipt = await send(null, (c) => c.createLease(tenant.address, roomName.trim(), rentWei, depositWei, period, count))
    const ev = eventsOf(receipt).find((x) => x.name === 'LeaseCreated')
    if (!ev) return
    try {
      await api.put(`/rooms/${room.id}/lease`, { leaseId: Number(ev.args.leaseId) })
      toast.success(`Đã tạo hợp đồng #${ev.args.leaseId} cho ${tenant.label}, chờ khách ký và đặt cọc`)
      onDone?.()
      onClose()
    } catch (err) {
      toast.error(`Hợp đồng đã tạo trên blockchain nhưng chưa gắn được với phòng: ${err.message}`)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Tạo hợp đồng thuê — phòng ${room.code}`} size="lg">
      <form className="space-y-4" onSubmit={submit}>
        {candidates.length > 0 && (
          <div>
            <span className="label">Khách đã thoả thuận</span>
            <div className="flex flex-wrap gap-2">
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.address}
                  onClick={() => setTenantInput(c.address)}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${sameAddress(tenantInput, c.address) ? 'bg-brand-500 text-white' : 'bg-slate-100 text-ink hover:bg-slate-200'}`}
                >
                  {c.label} · {c.source}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field
          label="Người thuê (nickname hoặc địa chỉ ví)"
          error={tenant?.error || (self && 'Không thể tạo hợp đồng cho chính mình')}
          hint={tenant?.address && !self ? `Người thuê: ${tenant.label} (${shortAddress(tenant.address)})` : undefined}
        >
          <input className="input" value={tenantInput} onChange={(e) => setTenantInput(e.target.value)} placeholder="Nickname hoặc 0x…" />
        </Field>
        <Field label="Tên phòng ghi trên hợp đồng">
          <input className="input" value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={100} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tiền phòng mỗi kỳ (ETH)">
            <input className="input" type="number" min="0" step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} />
          </Field>
          <Field label="Tiền cọc (ETH)">
            <input className="input" type="number" min="0" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
          <Field label="Kỳ thanh toán">
            <select className="input" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {PERIOD_OPTIONS.map((o) => <option key={o.seconds} value={o.seconds}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Số kỳ thuê">
            <input className="input" type="number" min="1" max={MAX_PERIODS} value={periods} onChange={(e) => setPeriods(e.target.value)} />
          </Field>
        </div>
        {errors.map((e) => <p key={e} className="text-xs font-semibold text-red-600">{e}</p>)}
        {rentWei > 0n && depositWei != null && count > 0 && (
          <div className="rounded-xl bg-gold-100/70 px-4 py-3 text-sm leading-7">
            Thời hạn: <b>{count} kỳ × {formatPeriod(period)}</b>
            <br />Khách gửi khi ký (cọc + kỳ đầu): <b>{fmtEth(depositWei + rentWei, 6)} ETH</b>
            <br />Tổng tiền phòng cả hợp đồng: <b>{fmtEth(rentWei * BigInt(count), 6)} ETH</b>
          </div>
        )}
        {!wallet && <p className="text-sm font-semibold text-red-600">Kết nối ví MetaMask (góc trên phải) để tạo hợp đồng.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" disabled={!valid || busy} loading={busy}>Tạo hợp đồng trên blockchain</Button>
        </div>
      </form>
    </Modal>
  )
}
