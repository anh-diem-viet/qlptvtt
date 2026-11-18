import { useState } from 'react'
import { ClipboardDocumentListIcon, CreditCardIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { fmtEth } from '../../lib/rental'
import { useApp } from '../../store/useApp'
import InvoiceDetail, { INVOICE_STATUS } from '../../components/InvoiceDetail'
import { Badge, Button, Card, EmptyState, Loading, PageHeader } from '../../components/common/ui'

const eth = (wei) => fmtEth(BigInt(wei))

export default function MyInvoices() {
  const { wallet, busy, send } = useApp()
  const { data, reload } = useFetch(() => api.get('/my/invoices'), [], 5000)
  const [detail, setDetail] = useState(null)
  const invoices = data?.invoices

  /** Thanh toán trên blockchain: trả đúng tổng hoá đơn, tiền vào số dư của chủ nhà. */
  async function pay(inv) {
    if (await send(`Đã thanh toán hoá đơn phòng ${inv.roomCode} tháng ${inv.month}`, (c) => c.payBill(inv.billId, { value: BigInt(inv.totalWei) }))) {
      setDetail(null)
      setTimeout(reload, 3500)
    }
  }

  const payButton = (inv) =>
    inv.status === 'issued' && (
      <Button size="sm" leftIcon={CreditCardIcon} disabled={!wallet || busy} onClick={() => pay(inv)}>
        Thanh toán {eth(inv.totalWei)} ETH
      </Button>
    )

  return (
    <div className="space-y-6">
      <PageHeader title="Hoá đơn của tôi" />
      <Card padding="none">
        {!invoices ? (
          <Loading />
        ) : invoices.length === 0 ? (
          <EmptyState icon={ClipboardDocumentListIcon} title="Chưa có hoá đơn nào" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Tháng</th><th>Phòng</th><th>Chủ nhà</th><th className="text-right">Tiền phòng</th><th className="text-right">Dịch vụ</th><th className="text-right">Tổng</th><th className="text-right">Còn lại</th><th>Trạng thái</th><th className="text-right" /></tr></thead>
              <tbody>
                {invoices.filter((i) => i.status !== 'draft').map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-bold">{inv.month}</td>
                    <td>{inv.roomCode}</td>
                    <td>{inv.ownerName}</td>
                    <td className="text-right tabular-nums">{eth(inv.rentWei)}</td>
                    <td className="text-right tabular-nums">{eth(inv.serviceTotalWei)}</td>
                    <td className="text-right font-bold tabular-nums">{eth(inv.totalWei)}</td>
                    <td className="text-right tabular-nums text-red-600">{eth(inv.remainingWei)}</td>
                    <td><Badge color={INVOICE_STATUS[inv.status].color}>{INVOICE_STATUS[inv.status].label}</Badge></td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setDetail(inv)}>Chi tiết</Button>
                        {payButton(inv)}
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
          role="tenant"
          onClose={() => setDetail(null)}
          onChanged={reload}
          actions={<div className="flex justify-end">{payButton(detail)}</div>}
        />
      )}
    </div>
  )
}
