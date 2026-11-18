import { useState } from 'react'
import { formatEther, parseEther } from 'ethers'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { fmtEth, shortAddress } from '../lib/rental'
import { Badge, Button, Field, Modal } from './common/ui'

export const INVOICE_STATUS = {
  draft: { label: 'Chưa phát hành', color: 'gray' },
  issued: { label: 'Chờ thanh toán', color: 'yellow' },
  partial: { label: 'Còn nợ', color: 'red' },
  paid: { label: 'Đã thu đủ', color: 'green' },
  cancelled: { label: 'Đã huỷ', color: 'gray' },
}

const eth = (wei, d = 6) => fmtEth(BigInt(wei), d)

/** Bảng khoản mục hoá đơn: Tiền phòng + từng dịch vụ = Tổng; Đã thu; Còn lại. */
export function InvoiceTable({ inv }) {
  return (
    <table className="table-base">
      <thead><tr><th>Khoản mục</th><th>Cách tính</th><th className="text-right">Số tiền (ETH)</th></tr></thead>
      <tbody>
        <tr>
          <td className="font-semibold">Tiền phòng</td>
          <td className="text-ink-soft">{inv.rentPeriods ? `${inv.rentPeriods} kỳ theo hợp đồng #${inv.leaseId}` : 'Đã trả trước qua hợp đồng'}</td>
          <td className="text-right tabular-nums">{eth(inv.rentWei)}</td>
        </tr>
        {inv.items.map((i) => (
          <tr key={i.serviceId}>
            <td className="font-semibold">Tiền {i.name.toLowerCase()}</td>
            <td className="text-ink-soft">
              {i.kind === 'metered' ? `(${i.newIndex} − ${i.oldIndex}) = ${i.quantity} ${i.unit} × ${eth(i.unitPriceWei)}` : `Phí cố định / ${i.unit}`}
            </td>
            <td className="text-right tabular-nums">{eth(i.amountWei)}</td>
          </tr>
        ))}
        <tr className="bg-brand-50/60">
          <td className="font-extrabold">Tổng cộng</td>
          <td className="text-ink-soft">Phòng + dịch vụ ({eth(inv.serviceTotalWei)})</td>
          <td className="text-right font-extrabold tabular-nums">{eth(inv.totalWei)}</td>
        </tr>
        <tr>
          <td className="font-semibold">Đã thu</td>
          <td className="text-ink-soft">{inv.payments.length} phiếu thu</td>
          <td className="text-right tabular-nums text-emerald-600">{eth(inv.paidWei)}</td>
        </tr>
        <tr>
          <td className="font-semibold">Còn lại</td>
          <td className="text-ink-soft">Tổng − Đã thu</td>
          <td className={`text-right font-extrabold tabular-nums ${inv.remainingWei !== '0' ? 'text-red-600' : ''}`}>{eth(inv.remainingWei)}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default function InvoiceDetail({ inv, role, onClose, onChanged, actions }) {
  const [amount, setAmount] = useState(formatEther(inv.remainingWei))
  const [method, setMethod] = useState('tien_mat')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function addPayment(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post(`/invoices/${inv.id}/payments`, { amountWei: parseEther(amount || '0').toString(), method, note })
      toast.success('Đã ghi phiếu thu')
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Hoá đơn #${inv.id} — phòng ${inv.roomCode}, tháng ${inv.month}`} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge color={INVOICE_STATUS[inv.status].color}>{INVOICE_STATUS[inv.status].label}</Badge>
          {inv.billId && <Badge color="blue">Trên blockchain: hoá đơn #{inv.billId}</Badge>}
          {inv.autoCreated && <Badge color="purple">Tự tạo đầu tháng</Badge>}
          <span className="text-ink-soft">{role === 'landlord' ? `Khách: ${inv.tenantName || shortAddress(inv.tenantAddress)}` : `Chủ nhà: ${inv.ownerName}`}</span>
        </div>
        <InvoiceTable inv={inv} />

        {inv.payments.length > 0 && (
          <div>
            <h4 className="mb-2 font-bold">Phiếu thu</h4>
            <table className="table-base">
              <thead><tr><th>Mã PT</th><th>Ngày thanh toán</th><th>Hình thức</th><th className="text-right">Số tiền thu</th></tr></thead>
              <tbody>
                {inv.payments.map((p) => (
                  <tr key={p.id}>
                    <td>PT{String(p.id).padStart(4, '0')}</td>
                    <td>{new Date(p.paidAt).toLocaleString('vi-VN')}</td>
                    <td>
                      <Badge color={p.method === 'blockchain' ? 'blue' : 'gray'}>{p.methodLabel}</Badge>
                      {p.txHash && <code className="ml-2 text-xs text-ink-soft">{shortAddress(p.txHash)}</code>}
                    </td>
                    <td className="text-right tabular-nums">{eth(p.amountWei)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {actions}

        {role === 'landlord' && inv.remainingWei !== '0' && inv.status !== 'cancelled' && (
          <form onSubmit={addPayment} className="space-y-3 rounded-xl border-2 border-dashed border-slate-200 p-4">
            <h4 className="font-bold">Ghi phiếu thu ngoài blockchain</h4>
            <p className="text-xs text-ink-soft">Khi khách trả tiền mặt hoặc chuyển khoản ngân hàng (trả thiếu thì hoá đơn ở trạng thái “Còn nợ”).</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Số tiền (ETH)"><input className="input" type="number" min="0" step="0.0001" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Hình thức">
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="tien_mat">Tiền mặt</option>
                  <option value="chuyen_khoan">Chuyển khoản</option>
                </select>
              </Field>
              <Field label="Ghi chú"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>
            <Button type="submit" variant="success" loading={saving}>Ghi phiếu thu</Button>
          </form>
        )}
      </div>
    </Modal>
  )
}
