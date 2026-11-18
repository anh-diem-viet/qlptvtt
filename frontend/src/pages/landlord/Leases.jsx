import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { useFetch, useNow } from '../../lib/hooks'
import { STATUS, fmtDate, fmtEth, formatCountdown, formatPeriod, leaseSchedule, sameAddress } from '../../lib/rental'
import { useApp } from '../../store/useApp'
import { LEASE_STATUS } from '../../components/lease/LeaseDetail'
import { Badge, Card, EmptyState, PageHeader } from '../../components/common/ui'

/** Tình trạng thanh toán ngắn gọn của một hợp đồng. */
export function paymentBadge(l, now) {
  if (l.status === STATUS.Pending) return <Badge color="yellow">Chờ khách ký</Badge>
  const s = leaseSchedule(l, now)
  if (!s || l.status !== STATUS.Active) return null
  if (l.extensionPeriods > 0) return <Badge color="blue">Đề xuất gia hạn {l.extensionPeriods} kỳ</Badge>
  if (s.overdue > 0) return <Badge color="red">Nợ {s.overdue} kỳ</Badge>
  if (s.expired) return <Badge color="yellow">Hết hạn — chờ quyết toán cọc</Badge>
  if (s.nextDueDate) return <Badge color="green">Kỳ tới: {formatCountdown(s.nextDueDate - now)}</Badge>
  return <Badge color="green">Đã trả đủ</Badge>
}

/** (3) HOPDONG — hợp đồng đọc từ blockchain, ghép với phòng / khách ở backend. */
export function LeaseTable({ leases, role }) {
  const { openLease, nameOf } = useApp()
  const now = useNow()
  const { data } = useFetch(() => (role === 'landlord' ? api.get('/leases') : Promise.resolve({ leases: [] })), [role])
  const byId = Object.fromEntries((data?.leases || []).map((l) => [l.leaseId, l]))
  if (!leases.length) {
    return (
      <EmptyState icon={DocumentTextIcon} title="Chưa có hợp đồng">
        {role === 'landlord' ? 'Vào “Phòng trọ”, chọn phòng trống và bấm “Hợp đồng”.' : 'Vào “Tìm phòng” để gửi yêu cầu thuê; khi chủ nhà tạo hợp đồng cho ví của bạn, hợp đồng sẽ hiện ở đây để ký.'}
      </EmptyState>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr><th>Mã HĐ</th><th>Phòng</th><th>{role === 'landlord' ? 'Khách thuê' : 'Chủ nhà'}</th><th>Tiền phòng</th><th>Tiền cọc</th><th>Bắt đầu</th><th>Kết thúc</th><th>Đã trả</th><th>Trạng thái</th><th>Thanh toán</th></tr>
        </thead>
        <tbody>
          {leases.map((l) => {
            const s = leaseSchedule(l, now)
            const extra = byId[l.id]
            return (
              <tr key={l.id} className="cursor-pointer" onClick={() => openLease(l.id)}>
                <td><b>#{l.id}</b></td>
                <td>{extra?.roomCode ? <Badge color="blue">{extra.roomCode}</Badge> : null} <span className="text-sm">{l.roomName}</span></td>
                <td>{role === 'landlord' ? extra?.tenantName || nameOf(l.tenant) : nameOf(l.landlord)}</td>
                <td className="whitespace-nowrap tabular-nums">{fmtEth(l.rent)} / {formatPeriod(l.periodLength)}</td>
                <td className="tabular-nums">{fmtEth(l.deposit)}</td>
                <td className="whitespace-nowrap">{l.startDate ? fmtDate(l.startDate) : '—'}</td>
                <td className="whitespace-nowrap">{s ? fmtDate(s.endDate) : '—'}</td>
                <td className="tabular-nums">{l.paidPeriods}/{l.totalPeriods}</td>
                <td><Badge color={LEASE_STATUS[l.status].color}>{LEASE_STATUS[l.status].label}</Badge></td>
                <td>{paymentBadge(l, now)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Leases() {
  const { leases, viewer } = useApp()
  const who = viewer()
  const mine = leases.filter((l) => sameAddress(l.landlord, who)).reverse()
  return (
    <div className="space-y-6">
      <PageHeader title="Hợp đồng thuê" />
      <Card padding="none">
        <LeaseTable leases={mine} role="landlord" />
      </Card>
    </div>
  )
}
