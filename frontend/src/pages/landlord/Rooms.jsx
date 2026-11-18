import { useState } from 'react'
import { formatEther, parseEther } from 'ethers'
import toast from 'react-hot-toast'
import { DocumentPlusIcon, HomeModernIcon, InboxArrowDownIcon, PencilSquareIcon, PlusIcon, TrashIcon, WrenchIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { fmtDate, fmtEth, shortAddress } from '../../lib/rental'
import { useApp } from '../../store/useApp'
import CreateLeaseModal from '../../components/lease/CreateLeaseModal'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Loading, Modal, PageHeader } from '../../components/common/ui'

export const ROOM_STATUS = {
  vacant: { label: 'Trống', color: 'red' },
  pending: { label: 'Chờ ký', color: 'yellow' },
  occupied: { label: 'Đã thuê', color: 'green' },
}
const EQUIPMENT_STATE = { tot: { label: 'Tốt', color: 'green' }, can_sua: { label: 'Cần sửa', color: 'yellow' }, hong: { label: 'Hỏng', color: 'red' } }

function RoomForm({ room, onClose, onSaved }) {
  const [f, setF] = useState({
    code: room?.code || '',
    name: room?.name || '',
    floor: room?.floor ?? 1,
    area: room?.area ?? 18,
    price: room ? formatEther(room.priceWei) : '0.3',
    deposit: room ? formatEther(room.depositWei) : '0.6',
    note: room?.note || '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { ...f, priceWei: parseEther(f.price || '0').toString(), depositWei: parseEther(f.deposit || '0').toString() }
      await (room ? api.put(`/rooms/${room.id}`, body) : api.post('/rooms', body))
      toast.success(room ? 'Đã cập nhật phòng' : `Đã thêm phòng ${f.code.toUpperCase()}`)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={room ? `Sửa phòng ${room.code}` : 'Thêm phòng'}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mã phòng" hint="Đặt theo tầng: P101, P102, P201…"><input className="input" value={f.code} onChange={set('code')} required /></Field>
          <Field label="Tên phòng"><input className="input" value={f.name} onChange={set('name')} placeholder="vd. Phòng 101" /></Field>
          <Field label="Tầng"><input className="input" type="number" value={f.floor} onChange={set('floor')} /></Field>
          <Field label="Diện tích (m²)"><input className="input" type="number" step="0.1" value={f.area} onChange={set('area')} /></Field>
          <Field label="Giá thuê / kỳ (ETH)"><input className="input" type="number" step="0.01" value={f.price} onChange={set('price')} /></Field>
          <Field label="Tiền cọc (ETH)"><input className="input" type="number" step="0.01" value={f.deposit} onChange={set('deposit')} /></Field>
        </div>
        <Field label="Ghi chú"><input className="input" value={f.note} onChange={set('note')} placeholder="vd. Có gác xép, cửa sổ thoáng" /></Field>
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" loading={saving}>Lưu</Button>
        </div>
      </form>
    </Modal>
  )
}

/** (8) THIETBI — đồ dùng trong phòng. */
function EquipmentModal({ room, onClose, onChanged }) {
  const { data, reload } = useFetch(() => api.get(`/rooms/${room.id}/equipment`), [room.id])
  const [name, setName] = useState('')
  const [state, setState] = useState('tot')
  const [note, setNote] = useState('')
  const run = async (p) => {
    try {
      await p
      await reload()
      onChanged()
    } catch (err) {
      toast.error(err.message)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Thiết bị trong phòng ${room.code}`} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Danh sách đồ dùng để bàn giao khi khách vào ở và đối chiếu khi trả phòng (căn cứ khấu trừ tiền cọc).</p>
        {!data ? (
          <Loading />
        ) : data.equipment.length === 0 ? (
          <EmptyState icon={WrenchIcon} title="Chưa có thiết bị nào" />
        ) : (
          <table className="table-base">
            <thead><tr><th>Tên thiết bị</th><th>Tình trạng</th><th>Ghi chú</th><th /></tr></thead>
            <tbody>
              {data.equipment.map((e) => (
                <tr key={e.id}>
                  <td className="font-semibold">{e.name}</td>
                  <td>
                    <select className="input w-auto py-1" value={e.state} onChange={(ev) => run(api.put(`/equipment/${e.id}`, { ...e, state: ev.target.value }))}>
                      {Object.entries(EQUIPMENT_STATE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td className="text-ink-soft">{e.note}</td>
                  <td className="text-right">
                    <button className="text-red-500 hover:text-red-700" onClick={() => run(api.del(`/equipment/${e.id}`))} aria-label="Xoá"><TrashIcon className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            run(api.post(`/rooms/${room.id}/equipment`, { name, state, note })).then(() => { setName(''); setNote('') })
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="vd. Điều hoà, bình nóng lạnh" required />
          <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
            {Object.entries(EQUIPMENT_STATE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú" />
          <Button type="submit" leftIcon={PlusIcon}>Thêm</Button>
        </form>
      </div>
    </Modal>
  )
}

export default function Rooms() {
  const { openLease, wallet } = useApp()
  const { data, reload } = useFetch(() => api.get('/rooms'), [], 5000)
  const { data: req, reload: reloadReq } = useFetch(() => api.get('/requests'), [], 5000)
  const { data: tn } = useFetch(() => api.get('/tenants'), [])
  const [form, setForm] = useState(null) // { room? }
  const [equipRoom, setEquipRoom] = useState(null)
  const [leaseRoom, setLeaseRoom] = useState(null)

  const rooms = data?.rooms
  const pending = (req?.requests || []).filter((r) => r.status === 'pending')
  const counts = rooms ? Object.fromEntries(Object.keys(ROOM_STATUS).map((k) => [k, rooms.filter((r) => r.status === k).length])) : {}

  /** Ứng viên người thuê cho phòng: khách đã gửi yêu cầu + hồ sơ khách có ví. */
  function candidatesFor(room) {
    const list = pending.filter((r) => r.roomId === room.id && r.walletAddress).map((r) => ({ address: r.walletAddress, label: r.name, source: 'yêu cầu thuê' }))
    for (const t of tn?.tenants || []) {
      if (t.walletAddress && !list.some((c) => c.address.toLowerCase() === t.walletAddress.toLowerCase())) list.push({ address: t.walletAddress, label: t.fullName, source: t.code })
    }
    return list
  }

  async function reject(r) {
    try {
      await api.put(`/requests/${r.id}`, { status: 'rejected' })
      toast.success('Đã từ chối yêu cầu')
      reloadReq()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function remove(room) {
    if (!window.confirm(`Xoá phòng ${room.code}?`)) return
    try {
      await api.del(`/rooms/${room.id}`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh sách phòng"
        actions={<Button leftIcon={PlusIcon} onClick={() => setForm({})}>Thêm phòng</Button>}
      />

      {pending.length > 0 && (
        <Card>
          <CardHeader icon={InboxArrowDownIcon} title={`Yêu cầu thuê mới (${pending.length})`} />
          <ul className="space-y-2">
            {pending.map((r) => {
              const room = rooms?.find((x) => x.id === r.roomId)
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-violet-50/60 px-4 py-3">
                  <Badge color="purple">{r.roomCode}</Badge>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-bold">{r.name} <span className="font-normal text-ink-soft">· {r.email} · {shortAddress(r.walletAddress)}</span></p>
                    {r.message && <p className="text-ink-soft">“{r.message}”</p>}
                    <p className="text-xs text-ink-soft">{new Date(r.createdAt).toLocaleString('vi-VN')}</p>
                  </div>
                  <Button size="sm" leftIcon={DocumentPlusIcon} disabled={!room || room.status !== 'vacant'} onClick={() => setLeaseRoom(room)}>Tạo hợp đồng</Button>
                  <Button size="sm" variant="secondary" onClick={() => reject(r)}>Từ chối</Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card padding="none">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <HomeModernIcon className="h-5 w-5 text-brand-500" />
          <b className="mr-auto">{rooms?.length ?? 0} phòng</b>
          {Object.entries(ROOM_STATUS).map(([k, v]) => <Badge key={k} color={v.color}>{v.label}: {counts[k] ?? 0}</Badge>)}
        </div>
        {!rooms ? (
          <Loading />
        ) : rooms.length === 0 ? (
          <EmptyState icon={HomeModernIcon} title="Chưa có phòng nào">Thêm phòng đầu tiên: mã phòng, tầng, diện tích, giá thuê, tiền cọc.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Mã phòng</th><th>Tầng</th><th>Diện tích</th><th>Giá thuê</th><th>Trạng thái</th><th>Khách thuê hiện tại</th><th>Ngày bắt đầu</th><th>Tiền cọc</th><th>Thiết bị</th><th className="text-right">Thao tác</th></tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.code}</b><div className="text-xs text-ink-soft">{r.name}</div></td>
                    <td>{r.floor}</td>
                    <td>{r.area} m²</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtEth(BigInt(r.priceWei))} ETH</td>
                    <td><Badge color={ROOM_STATUS[r.status].color}>{ROOM_STATUS[r.status].label}</Badge></td>
                    <td>{r.tenants.map((t) => t.name).join(', ') || <span className="text-ink-soft">—</span>}</td>
                    <td className="whitespace-nowrap">{r.lease?.startDate ? fmtDate(r.lease.startDate) : '—'}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtEth(BigInt(r.lease?.depositWei ?? r.depositWei))} ETH{r.status === 'occupied' && <div className="text-[11px] text-emerald-600">🔒 đang giữ</div>}</td>
                    <td>
                      <button className="text-xs font-bold text-brand-600 hover:underline" onClick={() => setEquipRoom(r)}>
                        {r.equipment.count} món{r.equipment.needsRepair > 0 && <span className="text-red-500"> · {r.equipment.needsRepair} cần sửa</span>}
                      </button>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        {r.status === 'vacant' ? (
                          <Button size="sm" variant="gold" leftIcon={DocumentPlusIcon} disabled={!wallet} title={wallet ? '' : 'Kết nối ví trước'} onClick={() => setLeaseRoom(r)}>Hợp đồng</Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => openLease(r.leaseId)}>HĐ #{r.leaseId}</Button>
                        )}
                        <button className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100" onClick={() => setForm({ room: r })} aria-label="Sửa"><PencilSquareIcon className="h-4 w-4" /></button>
                        {r.status === 'vacant' && <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove(r)} aria-label="Xoá"><TrashIcon className="h-4 w-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {form && <RoomForm room={form.room} onClose={() => setForm(null)} onSaved={reload} />}
      {equipRoom && <EquipmentModal room={equipRoom} onClose={() => setEquipRoom(null)} onChanged={reload} />}
      {leaseRoom && (
        <CreateLeaseModal room={leaseRoom} candidates={candidatesFor(leaseRoom)} onClose={() => setLeaseRoom(null)} onDone={() => { reload(); reloadReq() }} />
      )}
    </div>
  )
}
