import { useApp } from '../../store/useApp'
import { STATUS, sameAddress } from '../../lib/rental'
import { Callout, Card, PageHeader } from '../../components/common/ui'
import { LeaseTable } from '../landlord/Leases'
import { PencilSquareIcon } from '@heroicons/react/24/outline'

export default function MyLeases() {
  const { leases, viewer } = useApp()
  const who = viewer()
  const mine = leases.filter((l) => sameAddress(l.tenant, who)).reverse()
  const toSign = mine.filter((l) => l.status === STATUS.Pending).length
  return (
    <div className="space-y-6">
      <PageHeader title="Phòng đang thuê" />
      {toSign > 0 && (
        <Callout color="yellow" icon={PencilSquareIcon}>
          Bạn có <b>{toSign} hợp đồng chờ ký</b>. Ký = gửi tiền cọc + tiền phòng kỳ đầu, phòng sẽ chuyển sang “Đã thuê”.
        </Callout>
      )}
      <Card padding="none">
        <LeaseTable leases={mine} role="tenant" />
      </Card>
    </div>
  )
}
