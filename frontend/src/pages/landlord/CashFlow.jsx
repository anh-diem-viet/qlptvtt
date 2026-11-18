import { useState } from 'react'
import { parseEther } from 'ethers'
import toast from 'react-hot-toast'
import { ArrowTrendingDownIcon, ArrowTrendingUpIcon, BanknotesIcon, PlusIcon, ScaleIcon, TrashIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { currentMonth, useFetch } from '../../lib/hooks'
import { fmtEth } from '../../lib/rental'
import { Badge, Button, Card, EmptyState, Field, Loading, Modal, MonthPicker, PageHeader, StatCard } from '../../components/common/ui'

const SOURCE = { chain: { label: 'Blockchain', color: 'blue' }, payment: { label: 'Phiếu thu', color: 'purple' }, manual: { label: 'Nhập tay', color: 'gray' } }
const EXPENSE_CATEGORIES = ['Sửa chữa', 'Điện nước chung', 'Internet chung', 'Phí đổ rác', 'Vệ sinh', 'Khác']

function EntryForm({ rooms, onClose, onSaved }) {
  const [f, setF] = useState({ date: new Date().toLocaleDateString('sv-SE'), type: 'chi', category: 'Sửa chữa', roomId: '', amount: '', note: '' })
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault()
    try {
      await api.post('/cashflow', { ...f, amountWei: parseEther(f.amount || '0').toString() })
      toast.success('Đã ghi sổ thu chi')
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <Modal open onClose={onClose} title="Ghi khoản thu / chi">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ngày"><input className="input" type="date" value={f.date} onChange={set('date')} /></Field>
          <Field label="Loại">
            <select className="input" value={f.type} onChange={set('type')}>
              <option value="chi">Chi</option>
              <option value="thu">Thu</option>
            </select>
          </Field>
          <Field label="Hạng mục">
            <input className="input" list="categories" value={f.category} onChange={set('category')} />
            <datalist id="categories">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Phòng (nếu liên quan)">
            <select className="input" value={f.roomId} onChange={set('roomId')}>
              <option value="">— Chung —</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
            </select>
          </Field>
          <Field label="Số tiền (ETH)"><input className="input" type="number" min="0" step="0.001" value={f.amount} onChange={set('amount')} required /></Field>
          <Field label="Ghi chú"><input className="input" value={f.note} onChange={set('note')} placeholder="vd. Thay phao máy bơm" /></Field>
        </div>
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit">Lưu</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function CashFlow() {
  const [month, setMonth] = useState(currentMonth())
  const { data, reload } = useFetch(() => api.get('/cashflow', { month }), [month], 5000)
  const { data: rm } = useFetch(() => api.get('/rooms'), [])
  const [form, setForm] = useState(false)

  async function remove(e) {
    if (!window.confirm('Xoá khoản này?')) return
    await api.del(`/cashflow/${e.id}`).catch((err) => toast.error(err.message))
    reload()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thu chi"
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Button leftIcon={PlusIcon} onClick={() => setForm(true)}>Ghi khoản thu / chi</Button>
          </>
        }
      />
      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={ArrowTrendingUpIcon} color="green" label="Tổng thu" value={`${fmtEth(BigInt(data.incomeWei))} ETH`} />
          <StatCard icon={ArrowTrendingDownIcon} color="red" label="Tổng chi vận hành" value={`${fmtEth(BigInt(data.expenseWei))} ETH`} />
          <StatCard icon={ScaleIcon} color="blue" label="Còn lại" value={`${fmtEth(BigInt(data.netWei))} ETH`} />
        </div>
      )}
      <Card padding="none">
        {!data ? (
          <Loading />
        ) : data.entries.length === 0 ? (
          <EmptyState icon={BanknotesIcon} title={`Chưa có khoản thu chi nào trong tháng ${month}`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Ngày</th><th>Loại</th><th>Hạng mục</th><th>Phòng</th><th className="text-right">Số tiền (ETH)</th><th>Ghi chú</th><th>Nguồn</th><th /></tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{new Date(e.date).toLocaleDateString('vi-VN')}</td>
                    <td><Badge color={e.type === 'thu' ? 'green' : 'red'}>{e.type === 'thu' ? 'Thu' : 'Chi'}</Badge></td>
                    <td className="font-semibold">{e.category}</td>
                    <td>{e.roomCode || '—'}</td>
                    <td className={`text-right font-bold tabular-nums ${e.type === 'thu' ? 'text-emerald-600' : 'text-red-600'}`}>{e.type === 'thu' ? '+' : '−'}{fmtEth(BigInt(e.amountWei), 6)}</td>
                    <td className="text-ink-soft">{e.note}</td>
                    <td><Badge color={SOURCE[e.source].color}>{SOURCE[e.source].label}</Badge></td>
                    <td className="text-right">
                      {e.source === 'manual' && <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove(e)} aria-label="Xoá"><TrashIcon className="h-4 w-4" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {form && <EntryForm rooms={rm?.rooms || []} onClose={() => setForm(false)} onSaved={reload} />}
    </div>
  )
}
