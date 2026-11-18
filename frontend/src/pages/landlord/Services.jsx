import { useState } from 'react'
import { formatEther, parseEther } from 'ethers'
import toast from 'react-hot-toast'
import { CheckIcon, PlusIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { Button, Card, Loading, PageHeader } from '../../components/common/ui'

/** (4) DICHVU — một dòng dịch vụ có thể sửa trực tiếp. */
function ServiceRow({ s, onSaved }) {
  const [f, setF] = useState({ name: s.name, unit: s.unit, price: formatEther(s.unitPriceWei), kind: s.kind, active: s.active })
  const dirty = f.name !== s.name || f.unit !== s.unit || f.price !== formatEther(s.unitPriceWei) || f.kind !== s.kind || f.active !== s.active
  async function save() {
    try {
      await api.put(`/services/${s.id}`, { ...f, unitPriceWei: parseEther(f.price || '0').toString() })
      toast.success(`Đã lưu dịch vụ ${f.name}`)
      onSaved()
    } catch (err) {
      toast.error(err.message)
    }
  }
  return (
    <tr className={f.active ? '' : 'opacity-50'}>
      <td><input className="input py-1.5" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
      <td>
        <select className="input py-1.5" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="metered">Theo chỉ số</option>
          <option value="fixed">Cố định / tháng</option>
        </select>
      </td>
      <td><input className="input w-36 py-1.5" type="number" min="0" step="0.0001" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></td>
      <td><input className="input w-24 py-1.5" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></td>
      <td>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Đang dùng
        </label>
      </td>
      <td className="text-right"><Button size="sm" leftIcon={CheckIcon} disabled={!dirty} onClick={save}>Lưu</Button></td>
    </tr>
  )
}

export default function Services() {
  const { data, reload } = useFetch(() => api.get('/services'), [])
  const [adding, setAdding] = useState(false)
  async function add() {
    setAdding(true)
    try {
      await api.post('/services', { name: `Dịch vụ ${(data?.services.length || 0) + 1}`, unit: 'tháng', unitPriceWei: '0', kind: 'fixed' })
      reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAdding(false)
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dịch vụ & đơn giá"
        actions={<Button leftIcon={PlusIcon} loading={adding} onClick={add}>Thêm dịch vụ</Button>}
      />
      <Card padding="none">
        {!data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Tên dịch vụ</th><th>Cách tính</th><th>Đơn giá (ETH)</th><th>Đơn vị tính</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>{data.services.map((s) => <ServiceRow key={`${s.id}-${s.unitPriceWei}-${s.active}`} s={s} onSaved={reload} />)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
