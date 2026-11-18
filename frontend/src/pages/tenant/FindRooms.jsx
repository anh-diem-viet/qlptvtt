import { useState } from 'react'
import toast from 'react-hot-toast'
import { HomeModernIcon, InboxArrowDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { fmtEth } from '../../lib/rental'
import { useApp } from '../../store/useApp'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Loading, Modal, PageHeader } from '../../components/common/ui'

const REQUEST_STATUS = {
  pending: { label: 'Chờ chủ nhà phản hồi', color: 'yellow' },
  accepted: { label: 'Đã tạo hợp đồng', color: 'green' },
  rejected: { label: 'Bị từ chối', color: 'red' },
  withdrawn: { label: 'Đã rút', color: 'gray' },
}
const EQUIPMENT_STATE = { tot: 'tốt', can_sua: 'cần sửa', hong: 'hỏng' }

function RequestModal({ room, onClose, onSent }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  return (
    <Modal open onClose={onClose} title={`Thuê phòng ${room.code} — ${room.name}`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setSending(true)
          try {
            await api.post(`/market/rooms/${room.id}/requests`, { message })
            toast.success('Đã gửi yêu cầu thuê, chờ chủ nhà liên hệ hẹn xem phòng')
            onSent()
            onClose()
          } catch (err) {
            toast.error(err.message)
          } finally {
            setSending(false)
          }
        }}
      >
        <p className="text-sm text-ink-soft">
          Giá {fmtEth(BigInt(room.priceWei))} ETH/kỳ · cọc {fmtEth(BigInt(room.depositWei))} ETH · {room.area} m² · chủ nhà {room.ownerName}
        </p>
        <Field label="Lời nhắn cho chủ nhà" hint="Thời gian muốn xem phòng, số người ở, ngày muốn chuyển vào…">
          <textarea className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="vd. Em muốn xem phòng tối thứ 7, 2 người ở, dọn vào đầu tháng sau." />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" loading={sending}>Gửi yêu cầu thuê</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function FindRooms() {
  const { user } = useApp()
  const { data, reload } = useFetch(() => api.get('/market/rooms'), [], 8000)
  const { data: my, reload: reloadMy } = useFetch(() => api.get('/my/requests'), [], 8000)
  const [q, setQ] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [requestRoom, setRequestRoom] = useState(null)
  const rooms = (data?.rooms || []).filter(
    (r) =>
      (!q || `${r.code} ${r.name} ${r.note || ''} ${r.ownerName}`.toLowerCase().includes(q.toLowerCase())) &&
      (!maxPrice || Number(r.priceWei) / 1e18 <= Number(maxPrice)),
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Tìm phòng" />
      {!user.walletAddress && (
        <Card className="border-gold-300 bg-gold-100/60 text-sm font-semibold text-[#5a3b00]">Hãy kết nối và liên kết ví MetaMask trước khi gửi yêu cầu thuê.</Card>
      )}
      <Card padding="sm" className="flex flex-wrap items-center gap-3 px-4">
        <MagnifyingGlassIcon className="h-5 w-5 text-ink-soft" />
        <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã phòng, tên, ghi chú, chủ nhà…" />
        <input className="input w-44" type="number" min="0" step="0.05" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Giá tối đa (ETH)" />
      </Card>

      {!data ? (
        <Loading />
      ) : rooms.length === 0 ? (
        <Card><EmptyState icon={HomeModernIcon} title="Chưa có phòng trống phù hợp" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-extrabold">{r.code} · {r.name}</p>
                  <p className="text-xs text-ink-soft">Tầng {r.floor} · {r.area} m² · chủ nhà {r.ownerName}</p>
                </div>
                <Badge color="red">Trống</Badge>
              </div>
              <div className="flex gap-4 rounded-xl bg-brand-50/60 px-3 py-2 text-sm">
                <div><p className="text-xs text-ink-soft">Giá thuê / kỳ</p><b className="text-brand-700">{fmtEth(BigInt(r.priceWei))} ETH</b></div>
                <div><p className="text-xs text-ink-soft">Tiền cọc</p><b>{fmtEth(BigInt(r.depositWei))} ETH</b></div>
              </div>
              {r.note && <p className="text-sm text-ink-soft">{r.note}</p>}
              {r.equipment.length > 0 && (
                <p className="text-xs text-ink-soft">Thiết bị: {r.equipment.map((e) => `${e.name}${e.state !== 'tot' ? ` (${EQUIPMENT_STATE[e.state]})` : ''}`).join(', ')}</p>
              )}
              <div className="mt-auto">
                {r.myRequest ? (
                  <Badge color={REQUEST_STATUS[r.myRequest].color}>{REQUEST_STATUS[r.myRequest].label}</Badge>
                ) : (
                  <Button className="w-full" leftIcon={InboxArrowDownIcon} disabled={!user.walletAddress} onClick={() => setRequestRoom(r)}>Gửi yêu cầu thuê</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader icon={InboxArrowDownIcon} title="Yêu cầu thuê của tôi" />
        {!my?.requests?.length ? (
          <p className="text-sm text-ink-soft">Bạn chưa gửi yêu cầu nào.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {my.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Badge color="blue">{r.roomCode}</Badge>
                <span className="flex-1">{r.roomName} · chủ nhà {r.ownerName}<span className="block text-xs text-ink-soft">{new Date(r.createdAt).toLocaleString('vi-VN')}</span></span>
                <Badge color={REQUEST_STATUS[r.status].color}>{REQUEST_STATUS[r.status].label}</Badge>
                {r.status === 'pending' && (
                  <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/my/requests/${r.id}`); reloadMy(); reload() }}>Rút lại</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {requestRoom && <RequestModal room={requestRoom} onClose={() => setRequestRoom(null)} onSent={() => { reload(); reloadMy() }} />}
    </div>
  )
}
