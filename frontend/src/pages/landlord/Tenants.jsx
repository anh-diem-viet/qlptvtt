import { useState } from 'react'
import toast from 'react-hot-toast'
import { PencilSquareIcon, PlusIcon, TrashIcon, UsersIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { shortAddress } from '../../lib/rental'
import { Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader } from '../../components/common/ui'

function TenantForm({ tenant, rooms, onClose, onSaved }) {
  const [f, setF] = useState({
    fullName: tenant?.fullName || '',
    idNumber: tenant?.idNumber || '',
    phone: tenant?.phone || '',
    email: tenant?.email || '',
    hometown: tenant?.hometown || '',
    roomId: tenant?.roomId || '',
    walletAddress: tenant?.walletAddress || '',
    moveInDate: tenant?.moveInDate || new Date().toLocaleDateString('sv-SE'),
    peopleCount: tenant?.peopleCount || 1,
    idPhotoUrl: tenant?.idPhotoUrl || '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await (tenant ? api.put(`/tenants/${tenant.id}`, f) : api.post('/tenants', f))
      toast.success(tenant ? 'Đã cập nhật hồ sơ khách' : 'Đã thêm khách thuê')
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={tenant ? `Hồ sơ ${tenant.code}` : 'Thêm khách thuê'} size="lg">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Họ tên"><input className="input" value={f.fullName} onChange={set('fullName')} required /></Field>
          <Field label="CMND / CCCD"><input className="input" value={f.idNumber} onChange={set('idNumber')} placeholder="12 số" /></Field>
          <Field label="Số điện thoại"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Quê quán"><input className="input" value={f.hometown} onChange={set('hometown')} /></Field>
          <Field label="Phòng đang ở">
            <select className="input" value={f.roomId} onChange={set('roomId')}>
              <option value="">— Chưa ở phòng nào —</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
            </select>
          </Field>
          <Field label="Ngày vào"><input className="input" type="date" value={f.moveInDate} onChange={set('moveInDate')} /></Field>
          <Field label="Số người ở" hint="Để tính phụ phí nếu cần"><input className="input" type="number" min="1" max="20" value={f.peopleCount} onChange={set('peopleCount')} /></Field>
        </div>
        <Field label="Ví MetaMask của khách" hint="Để tạo hợp đồng trên blockchain cho khách"><input className="input" value={f.walletAddress} onChange={set('walletAddress')} placeholder="0x…" /></Field>
        <Field label="Link ảnh CCCD" hint="Đường dẫn ảnh đã lưu trên Google Drive — phục vụ khai báo tạm trú"><input className="input" value={f.idPhotoUrl} onChange={set('idPhotoUrl')} placeholder="https://drive.google.com/…" /></Field>
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" loading={saving}>Lưu</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Tenants() {
  const { data, reload } = useFetch(() => api.get('/tenants'), [])
  const { data: rm } = useFetch(() => api.get('/rooms'), [])
  const [form, setForm] = useState(null)
  const [q, setQ] = useState('')
  const tenants = (data?.tenants || []).filter((t) => !q || `${t.code} ${t.fullName} ${t.phone || ''} ${t.idNumber || ''} ${t.roomCode || ''}`.toLowerCase().includes(q.toLowerCase()))

  async function remove(t) {
    if (!window.confirm(`Xoá hồ sơ ${t.code} - ${t.fullName}?`)) return
    try {
      await api.del(`/tenants/${t.id}`)
      reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Khách thuê"
        actions={
          <>
            <input className="input w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên, SĐT, CCCD, phòng…" />
            <Button leftIcon={PlusIcon} onClick={() => setForm({})}>Thêm khách</Button>
          </>
        }
      />
      <Card padding="none">
        {!data ? (
          <Loading />
        ) : tenants.length === 0 ? (
          <EmptyState icon={UsersIcon} title="Chưa có khách thuê">Hồ sơ khách được tạo tự động khi khách ký hợp đồng, hoặc thêm tay.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Mã KH</th><th>Họ tên</th><th>CCCD</th><th>SĐT</th><th>Quê quán</th><th>Phòng</th><th>Ngày vào</th><th>Số người</th><th>Ví</th><th /></tr></thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.code}</b></td>
                    <td><b>{t.fullName}</b>{t.email && <div className="text-xs text-ink-soft">{t.email}</div>}</td>
                    <td className="tabular-nums">{t.idNumber || '—'}{t.idPhotoUrl && <a href={t.idPhotoUrl} target="_blank" rel="noreferrer" className="ml-1 text-xs text-brand-600">ảnh</a>}</td>
                    <td className="tabular-nums">{t.phone || '—'}</td>
                    <td>{t.hometown || '—'}</td>
                    <td>{t.roomCode ? <Badge color="green">{t.roomCode}</Badge> : <span className="text-ink-soft">—</span>}</td>
                    <td className="whitespace-nowrap">{t.moveInDate ? new Date(t.moveInDate).toLocaleDateString('vi-VN') : '—'}</td>
                    <td className="text-center">{t.peopleCount}</td>
                    <td><code className="text-xs">{t.walletAddress ? shortAddress(t.walletAddress) : '—'}</code></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100" onClick={() => setForm({ tenant: t })} aria-label="Sửa"><PencilSquareIcon className="h-4 w-4" /></button>
                        <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove(t)} aria-label="Xoá"><TrashIcon className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {form && <TenantForm tenant={form.tenant} rooms={rm?.rooms || []} onClose={() => setForm(null)} onSaved={reload} />}
    </div>
  )
}
