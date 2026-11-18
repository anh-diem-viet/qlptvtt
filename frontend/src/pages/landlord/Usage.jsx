import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { BoltIcon, CheckIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { currentMonth, useFetch } from '../../lib/hooks'
import { Badge, Button, Callout, Card, EmptyState, Loading, MonthPicker, PageHeader } from '../../components/common/ui'
import { ROOM_STATUS } from './Rooms'

/** Một dòng = chỉ số các dịch vụ tính theo chỉ số (điện, nước) của một phòng trong tháng. */
function UsageRow({ row, services, month, onSaved }) {
  const toVals = (items) => Object.fromEntries(items.map((i) => [i.serviceId, { old: String(i.oldIndex), new: i.newIndex == null ? '' : String(i.newIndex) }]))
  const [vals, setVals] = useState(() => toVals(row.items))
  const [saving, setSaving] = useState(false)
  // Chỉ nạp lại khi dữ liệu đã lưu của chính dòng này đổi — lưu dòng khác không xoá ô đang nhập dở
  const savedKey = JSON.stringify(row.items)
  useEffect(() => {
    setVals(toVals(JSON.parse(savedKey)))
  }, [savedKey])
  const saved = row.items.every((i) => i.saved)
  const filled = services.every((s) => vals[s.id]?.new !== '')
  const hasNegative = services.some((s) => vals[s.id]?.new !== '' && Number(vals[s.id].new) < Number(vals[s.id].old))

  async function save() {
    setSaving(true)
    try {
      await api.put('/usage', {
        month,
        roomId: row.roomId,
        items: services.map((s) => ({ serviceId: s.id, oldIndex: Number(vals[s.id].old), newIndex: Number(vals[s.id].new) })),
      })
      toast.success(`Đã lưu chỉ số phòng ${row.roomCode}`)
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className={clsx(row.roomStatus !== 'occupied' && 'opacity-60')}>
      <td>
        <b>{row.roomCode}</b>
        <div><Badge color={ROOM_STATUS[row.roomStatus].color}>{ROOM_STATUS[row.roomStatus].label}</Badge></div>
      </td>
      {services.map((s) => {
        const v = vals[s.id]
        const used = v.new === '' ? null : Number(v.new) - Number(v.old)
        const set = (k) => (e) => setVals({ ...vals, [s.id]: { ...v, [k]: e.target.value } })
        return [
          <td key={`${s.id}o`}><input className="input w-24 py-1.5" type="number" min="0" value={v.old} onChange={set('old')} disabled={row.invoiced} aria-label={`${s.name} cũ`} /></td>,
          <td key={`${s.id}n`}><input className="input w-24 py-1.5" type="number" min="0" value={v.new} onChange={set('new')} disabled={row.invoiced} aria-label={`${s.name} mới`} /></td>,
          // Số tiêu thụ tự tính = chỉ số mới - chỉ số cũ; âm (nhập nhầm) thì tô đỏ
          <td key={`${s.id}u`} className={clsx('text-center font-extrabold tabular-nums', used != null && used < 0 ? 'bg-red-100 text-red-600' : 'text-brand-700')}>
            {used == null ? '—' : `${used} ${s.unit}`}
          </td>,
        ]
      })}
      <td className="text-right">
        {row.invoiced ? (
          <Badge color="blue">Đã lập hoá đơn</Badge>
        ) : (
          <Button size="sm" variant={saved ? 'secondary' : 'primary'} leftIcon={CheckIcon} disabled={!filled || hasNegative} loading={saving} onClick={save}>
            {saved ? 'Cập nhật' : 'Lưu'}
          </Button>
        )}
      </td>
    </tr>
  )
}

export default function Usage() {
  const [month, setMonth] = useState(currentMonth())
  const { data, reload } = useFetch(() => api.get('/usage', { month }), [month])
  const services = data?.services || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chỉ số điện nước"
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />
      <Callout color="yellow" icon={BoltIcon}>
        Chỉ số mới nhỏ hơn chỉ số cũ sẽ bị <b className="text-red-600">tô đỏ</b> và không lưu được.
      </Callout>
      <Card padding="none">
        {!data ? (
          <Loading />
        ) : data.rows.length === 0 ? (
          <EmptyState icon={BoltIcon} title="Chưa có phòng nào" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th rowSpan={2}>Phòng</th>
                  {services.map((s) => <th key={s.id} colSpan={3} className="text-center">{s.name} ({s.unit})</th>)}
                  <th rowSpan={2} />
                </tr>
                <tr>
                  {services.map((s) => [
                    <th key={`${s.id}o`}>Chỉ số cũ</th>,
                    <th key={`${s.id}n`}>Chỉ số mới</th>,
                    <th key={`${s.id}u`} className="text-center">Tiêu thụ</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => <UsageRow key={`${month}-${row.roomId}`} row={row} services={services} month={month} onSaved={reload} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
