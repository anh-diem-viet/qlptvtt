import { useState } from 'react'
import toast from 'react-hot-toast'
import { DocumentPlusIcon, PaperAirplaneIcon, ReceiptPercentIcon, TrashIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { currentMonth, useFetch } from '../../lib/hooks'
import { fmtEth } from '../../lib/rental'
import { eventsOf, useApp } from '../../store/useApp'
import InvoiceDetail, { INVOICE_STATUS } from '../../components/InvoiceDetail'
import { Badge, Button, Callout, Card, EmptyState, Loading, MonthPicker, PageHeader, StatCard } from '../../components/common/ui'
import { BanknotesIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

const eth = (wei) => fmtEth(BigInt(wei))

export default function Invoices() {
  const { wallet, busy, send } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const { data, reload } = useFetch(() => api.get('/invoices', { month }), [month], 5000)
  const [result, setResult] = useState(null)
  const [detail, setDetail] = useState(null)
  const [generating, setGenerating] = useState(false)
  const invoices = data?.invoices

  async function generate() {
    setGenerating(true)
    try {
      const r = await api.post('/invoices/generate', { month })
      setResult(r)
      toast.success(`Đã tạo ${r.created.length} hoá đơn tháng ${month}`)
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGenerating(false)
    }
  }

  /** Xuất hoá đơn: ghi lên smart contract (issueBill) rồi gắn id hoá đơn trên chain ở backend. */
  async function issue(inv) {
    const receipt = await send(null, (c) => c.issueBill(inv.leaseId, inv.rentPeriods, BigInt(inv.serviceTotalWei), inv.memo))
    const ev = eventsOf(receipt).find((x) => x.name === 'BillIssued')
    if (!ev) return
    try {
      await api.put(`/invoices/${inv.id}/bill`, { billId: Number(ev.args.billId) })
      toast.success(`Đã xuất hoá đơn phòng ${inv.roomCode} lên blockchain, khách có thể thanh toán`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function cancelBill(inv) {
    if (!window.confirm('Huỷ hoá đơn trên blockchain (vd. nhập sai chỉ số)?')) return
    if (await send('Đã huỷ hoá đơn trên blockchain', (c) => c.cancelBill(inv.billId))) setTimeout(reload, 3500)
  }

  async function remove(inv) {
    if (!window.confirm(`Xoá hoá đơn phòng ${inv.roomCode} tháng ${inv.month}?`)) return
    try {
      await api.del(`/invoices/${inv.id}`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const sum = (k, f = () => true) => (invoices || []).filter(f).reduce((s, i) => s + BigInt(i[k]), 0n)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hoá đơn tháng"
        actions={
          <>
            <MonthPicker value={month} onChange={(m) => { setMonth(m); setResult(null) }} />
            <Button leftIcon={DocumentPlusIcon} loading={generating} onClick={generate}>Tạo hoá đơn tháng {month.slice(5)}/{month.slice(0, 4)}</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={BanknotesIcon} color="blue" label="Tổng phải thu" value={`${fmtEth(sum('totalWei', (i) => i.status !== 'cancelled'))} ETH`} hint={`${invoices?.length ?? 0} hoá đơn`} />
        <StatCard icon={CheckCircleIcon} color="green" label="Đã thu" value={`${fmtEth(sum('paidWei'))} ETH`} />
        <StatCard icon={ExclamationTriangleIcon} color="red" label="Còn lại (công nợ)" value={`${fmtEth(sum('remainingWei', (i) => i.status !== 'cancelled' && i.status !== 'draft'))} ETH`} hint={`Chưa phát hành: ${fmtEth(sum('totalWei', (i) => i.status === 'draft'))} ETH`} />
      </div>

      {result && (
        <Callout color={result.created.length ? 'green' : 'yellow'} icon={ReceiptPercentIcon}>
          Tạo {result.created.length} hoá đơn.
          {result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.skipped.map((s) => <li key={s.room}><b>{s.room}</b>: {s.reason}</li>)}
            </ul>
          )}
        </Callout>
      )}

      <Card padding="none">
        {!invoices ? (
          <Loading />
        ) : invoices.length === 0 ? (
          <EmptyState icon={ReceiptPercentIcon} title={`Chưa có hoá đơn tháng ${month}`}>
            Nhập chỉ số điện nước của tháng rồi bấm “Tạo hoá đơn”. Đầu tháng hệ thống cũng tự tạo hoá đơn tháng trước cho các phòng đủ chỉ số.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Phòng</th><th>Khách thuê</th><th className="text-right">Tiền phòng</th><th className="text-right">Tiền dịch vụ</th><th className="text-right">Tổng</th><th className="text-right">Đã thu</th><th className="text-right">Còn lại</th><th>Trạng thái</th><th className="text-right">Thao tác</th></tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><b>{inv.roomCode}</b><div className="text-xs text-ink-soft">HĐ #{inv.leaseId}</div></td>
                    <td>{inv.tenantName || '—'}</td>
                    <td className="text-right tabular-nums">{eth(inv.rentWei)}</td>
                    <td className="text-right tabular-nums">{eth(inv.serviceTotalWei)}</td>
                    <td className="text-right font-bold tabular-nums">{eth(inv.totalWei)}</td>
                    <td className="text-right tabular-nums text-emerald-600">{eth(inv.paidWei)}</td>
                    <td className="text-right tabular-nums text-red-600">{eth(inv.remainingWei)}</td>
                    <td><Badge color={INVOICE_STATUS[inv.status].color}>{INVOICE_STATUS[inv.status].label}</Badge></td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setDetail(inv)}>Chi tiết</Button>
                        {inv.status === 'draft' && (
                          <Button size="sm" variant="gold" leftIcon={PaperAirplaneIcon} disabled={!wallet || busy} onClick={() => issue(inv)}>Xuất</Button>
                        )}
                        {inv.status === 'issued' && (
                          <Button size="sm" variant="ghost" disabled={!wallet || busy} onClick={() => cancelBill(inv)}>Huỷ</Button>
                        )}
                        {(inv.status === 'draft' || inv.status === 'cancelled') && (
                          <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove(inv)} aria-label="Xoá"><TrashIcon className="h-4 w-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && (
        <InvoiceDetail
          inv={invoices?.find((i) => i.id === detail.id) || detail}
          role="landlord"
          onClose={() => setDetail(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}
