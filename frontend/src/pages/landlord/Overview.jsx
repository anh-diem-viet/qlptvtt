import { Link } from 'react-router-dom'
import {
  BanknotesIcon,
  BellAlertIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  HomeModernIcon,
  InboxArrowDownIcon,
  KeyIcon,
  LockClosedIcon,
  SignalIcon,
} from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { describeEvent } from '../../lib/events'
import { useFetch } from '../../lib/hooks'
import { fmtDate, fmtEth } from '../../lib/rental'
import { useApp } from '../../store/useApp'
import { Badge, Card, CardHeader, EmptyState, Loading, PageHeader, StatCard } from '../../components/common/ui'

/** Biểu đồ cột doanh thu / chi phí theo tháng (CSS thuần, không cần thư viện biểu đồ). */
function RevenueChart({ data }) {
  const max = data.reduce((m, d) => Math.max(m, Number(d.incomeWei), Number(d.expenseWei)), 0) || 1
  return (
    <div>
      <div className="flex h-56 items-end gap-3 border-b border-slate-200 pb-1">
        {data.map((d) => (
          <div key={d.month} className="flex h-full flex-1 items-end justify-center gap-1" title={`${d.month}: thu ${fmtEth(BigInt(d.incomeWei))} · chi ${fmtEth(BigInt(d.expenseWei))} ETH`}>
            <div className="w-1/3 max-w-8 rounded-t-md bg-gradient-to-t from-brand-500 to-brand-300" style={{ height: `${(Number(d.incomeWei) / max) * 100}%`, minHeight: Number(d.incomeWei) ? 4 : 0 }} />
            <div className="w-1/3 max-w-8 rounded-t-md bg-gradient-to-t from-gold-600 to-gold-300" style={{ height: `${(Number(d.expenseWei) / max) * 100}%`, minHeight: Number(d.expenseWei) ? 4 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        {data.map((d) => (
          <div key={d.month} className="flex-1 text-center text-xs font-semibold text-ink-soft">
            {d.month.slice(5)}/{d.month.slice(2, 4)}
            <div className="text-[11px] font-bold text-brand-600">{fmtEth(BigInt(d.incomeWei), 3)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-4 text-xs font-semibold text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-500" /> Thu (ETH)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-gold-500" /> Chi (ETH)</span>
      </div>
    </div>
  )
}

export default function Overview() {
  const { nameOf, openLease, viewer } = useApp()
  const who = viewer()
  const { data: ov, error } = useFetch(() => api.get('/overview'), [], 5000)
  const { data: act } = useFetch(() => (who ? api.get('/activity', { address: who }) : Promise.resolve({ events: [] })), [who], 5000)

  if (!ov) return error ? <p className="text-red-600">{error}</p> : <Loading />

  return (
    <div className="space-y-6">
      <PageHeader title="Tổng quan khu trọ" />
      {!ov.walletLinked && (
        <Card className="border-gold-300 bg-gold-100/60 text-sm font-semibold text-[#5a3b00]">
          Hãy kết nối và liên kết ví MetaMask (góc trên phải) để tạo hợp đồng, xuất hoá đơn và nhận tiền trên blockchain.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={SignalIcon} color="blue" label="Tỷ lệ lấp đầy" value={`${Math.round(ov.occupancyRate * 100)}%`} hint={`${ov.occupiedRooms}/${ov.totalRooms} phòng đang có khách`} />
        <StatCard icon={HomeModernIcon} color="red" label="Phòng trống" value={ov.vacantRooms} hint={ov.pendingRooms ? `${ov.pendingRooms} phòng chờ khách ký` : undefined} />
        <StatCard icon={ExclamationTriangleIcon} color="yellow" label="Công nợ chưa thu" value={`${fmtEth(BigInt(ov.debtWei))} ETH`} hint={`Hoá đơn ${fmtEth(BigInt(ov.unpaidInvoicesWei))} · tiền phòng quá hạn ${fmtEth(BigInt(ov.overdueRentWei))}`} />
        <StatCard icon={LockClosedIcon} color="green" label="Tiền cọc đang giữ" value={`${fmtEth(BigInt(ov.depositsHeldWei))} ETH`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={ChartBarIcon} title="Doanh thu theo tháng" />
          <RevenueChart data={ov.revenue} />
        </Card>

        <Card>
          <CardHeader
            icon={BellAlertIcon}
            title="Cần nhắc thu"
            actions={<Link to="/hoa-don" className="text-xs font-bold text-brand-600 hover:underline">Xem hoá đơn →</Link>}
          />
          {ov.reminders.length === 0 ? (
            <EmptyState icon={BanknotesIcon} title="Không có khoản nợ nào">Mọi hoá đơn đã được thanh toán.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {ov.reminders.map((r, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-red-50/60 px-3 py-2">
                  <Badge color="red">{r.roomCode}</Badge>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-semibold">{r.tenants.join(', ') || 'Khách thuê'}</p>
                    <p className="text-xs text-ink-soft">{r.kind === 'invoice' ? `Hoá đơn tháng ${r.month} chưa trả` : `Tiền phòng quá hạn ${r.periods} kỳ`}</p>
                  </div>
                  <b className="tabular-nums text-red-600">{fmtEth(BigInt(r.amountWei))}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card padding="sm" className="flex items-center gap-3 px-5">
          <InboxArrowDownIcon className="h-8 w-8 text-violet-500" />
          <div className="flex-1">
            <p className="text-sm font-bold">{ov.pendingRequests} yêu cầu thuê mới</p>
          </div>
          <Link to="/phong" className="text-xs font-bold text-brand-600 hover:underline">Xem →</Link>
        </Card>
        <Card padding="sm" className="flex items-center gap-3 px-5">
          <KeyIcon className="h-8 w-8 text-brand-500" />
          <div className="flex-1">
            <p className="text-sm font-bold">{ov.draftInvoices} hoá đơn chưa phát hành</p>
          </div>
          <Link to="/hoa-don" className="text-xs font-bold text-brand-600 hover:underline">Xem →</Link>
        </Card>
        <Card padding="sm" className="flex items-center gap-3 px-5">
          <BanknotesIcon className="h-8 w-8 text-emerald-500" />
          <div className="flex-1">
            <p className="text-sm font-bold">Ghi chỉ số điện nước</p>
          </div>
          <Link to="/dien-nuoc" className="text-xs font-bold text-brand-600 hover:underline">Nhập →</Link>
        </Card>
      </div>

      <Card>
        <CardHeader icon={SignalIcon} title="Hoạt động gần đây trên blockchain" />
        {!act?.events?.length ? (
          <p className="text-sm text-ink-soft">Chưa có hoạt động nào.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {act.events.slice(0, 12).map((ev, i) => {
              const d = describeEvent(ev, nameOf)
              return (
                <li key={i}>
                  <button onClick={() => openLease(ev.leaseId)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-brand-50/40">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100">{d.icon}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-sm">#{ev.leaseId} · {d.title}</b>
                      <span className="block truncate text-xs text-ink-soft">{d.text}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-soft">{fmtDate(ev.time)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
