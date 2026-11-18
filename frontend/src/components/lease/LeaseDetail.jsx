import { useEffect, useState } from 'react'
import { parseEther } from 'ethers'
import confetti from 'canvas-confetti'
import clsx from 'clsx'
import { CheckCircleIcon, ExclamationTriangleIcon, FlagIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { api } from '../../lib/api'
import { describeEvent } from '../../lib/events'
import { useNow } from '../../lib/hooks'
import {
  MAX_PERIODS,
  STATUS,
  fmtDate,
  fmtEth,
  formatCountdown,
  formatPeriod,
  leaseSchedule,
  sameAddress,
  shortAddress,
} from '../../lib/rental'
import { useApp } from '../../store/useApp'
import { Badge, Button, Callout, Field, Loading, Modal } from '../common/ui'

const MAX_CELLS = 60
export const LEASE_STATUS = [
  { label: 'Chờ ký', color: 'yellow' },
  { label: 'Đang thuê', color: 'green' },
  { label: 'Đã kết thúc', color: 'gray' },
  { label: 'Đã huỷ', color: 'red' },
]

function useLeaseEvents(leaseId) {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => api.get(`/leases/${leaseId}/events`).then((r) => alive && setEvents(r.events)).catch(() => {})
    load()
    const id = setInterval(load, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [leaseId])
  return events
}

function Section({ title, children }) {
  return (
    <section className="space-y-3 rounded-xl border-2 border-dashed border-slate-200 p-4">
      <h4 className="font-bold text-ink">{title}</h4>
      {children}
    </section>
  )
}

function Fact({ label, children }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{children}</dd>
    </div>
  )
}

function Body({ lease: l }) {
  const { wallet, busy, send, nameOf, viewer } = useApp()
  const now = useNow()
  const events = useLeaseEvents(l.id)
  const [payCount, setPayCount] = useState(1)
  const [extendCount, setExtendCount] = useState('3')
  const [deduction, setDeduction] = useState('0')
  const [note, setNote] = useState('')

  const me = wallet?.address
  const who = viewer()
  const s = leaseSchedule(l, now)
  const isLandlord = sameAddress(who, l.landlord)
  const isTenant = sameAddress(who, l.tenant)
  const canAct = !!me && sameAddress(me, who)
  const active = l.status === STATUS.Active
  const myProposal = l.extensionPeriods > 0 && sameAddress(l.extensionBy, who)
  const theirProposal = l.extensionPeriods > 0 && !myProposal
  const count = Math.min(Math.max(1, payCount), Math.max(1, s?.maxPayable || 1))
  const extendN = Number(extendCount)
  const extendValid = Number.isInteger(extendN) && extendN > 0 && l.totalPeriods + extendN <= MAX_PERIODS

  let deductionWei = null
  try {
    deductionWei = parseEther(deduction || '0')
  } catch {
    // số tiền không hợp lệ
  }
  const noteBytes = new TextEncoder().encode(note.trim()).length
  const deductionError =
    deductionWei == null || deductionWei < 0n
      ? 'Số tiền không hợp lệ'
      : deductionWei > l.deposit
        ? 'Khấu trừ vượt quá tiền cọc'
        : deductionWei > 0n && noteBytes === 0
          ? 'Phải ghi lý do khấu trừ'
          : noteBytes > 200
            ? 'Lý do tối đa 200 byte'
            : null

  const act = {
    sign: async () => {
      if (await send(`Đã ký hợp đồng #${l.id}, chúc bạn ở vui vẻ!`, (c) => c.signLease(l.id, { value: l.deposit + l.rent }))) {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
      }
    },
    cancel: () => window.confirm('Huỷ hợp đồng chưa ký này?') && send('Đã huỷ hợp đồng', (c) => c.cancelLease(l.id)),
    pay: (n) => send(`Đã trả ${n} kỳ tiền phòng (${fmtEth(l.rent * BigInt(n))} ETH)`, (c) => c.payRent(l.id, n, { value: l.rent * BigInt(n) })),
    propose: (n) => send(`Đã đề xuất gia hạn ${n} kỳ, chờ bên kia đồng ý`, (c) => c.proposeExtension(l.id, n)),
    accept: () => send('Đã gia hạn hợp đồng', (c) => c.acceptExtension(l.id)),
    cancelExt: () => send('Đã huỷ đề xuất gia hạn', (c) => c.cancelExtension(l.id)),
    end: () => {
      if (!window.confirm(`Kết thúc hợp đồng: hoàn ${fmtEth(l.deposit - deductionWei, 6)} ETH, khấu trừ ${fmtEth(deductionWei, 6)} ETH?`)) return
      send('Đã kết thúc hợp đồng và quyết toán tiền cọc — phòng chuyển về Trống', (c) => c.endLease(l.id, deductionWei, note.trim()))
    },
    terminate: () => window.confirm(`Chấm dứt trước hạn sẽ mất tiền cọc ${fmtEth(l.deposit, 6)} ETH. Bạn chắc chứ?`) && send('Đã chấm dứt hợp đồng', (c) => c.terminateEarly(l.id)),
    claim: () => send('Đã nhận lại tiền cọc vào số dư', (c) => c.claimDeposit(l.id)),
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-extrabold text-ink">{l.roomName}</h3>
        <Badge color={LEASE_STATUS[l.status].color}>{LEASE_STATUS[l.status].label}</Badge>
        {isLandlord && <Badge color="blue">Bạn là chủ nhà</Badge>}
        {isTenant && <Badge color="purple">Bạn là người thuê</Badge>}
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        <Fact label="Chủ nhà">{nameOf(l.landlord)} <code className="text-xs text-ink-soft">{shortAddress(l.landlord)}</code></Fact>
        <Fact label="Người thuê">{nameOf(l.tenant)} <code className="text-xs text-ink-soft">{shortAddress(l.tenant)}</code></Fact>
        <Fact label="Tiền phòng">{fmtEth(l.rent, 6)} ETH / {formatPeriod(l.periodLength)}</Fact>
        <Fact label="Tiền cọc">{fmtEth(l.deposit, 6)} ETH{active && l.deposit > 0n && ' · 🔒 contract đang giữ'}</Fact>
        <Fact label="Thời hạn">{l.totalPeriods} kỳ ({l.paidPeriods} kỳ đã trả)</Fact>
        <Fact label={l.startDate ? 'Bắt đầu → hết hạn' : 'Tạo lúc'}>{l.startDate ? `${fmtDate(l.startDate)} → ${fmtDate(s.endDate)}` : fmtDate(l.createdAt)}</Fact>
      </dl>

      {s && l.totalPeriods <= MAX_CELLS && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: l.totalPeriods }, (_, i) => {
            const late = active && i < s.dueCount
            const state = i < l.paidPeriods ? 'paid' : late ? 'late' : 'todo'
            return (
              <span
                key={i}
                title={`Kỳ ${i + 1} — hạn ${fmtDate(l.startDate + i * l.periodLength)}`}
                className={clsx(
                  'grid h-7 w-7 place-items-center rounded-lg text-[11px] font-bold',
                  state === 'paid' && 'bg-emerald-500 text-white',
                  state === 'late' && 'animate-pulse bg-red-500 text-white',
                  state === 'todo' && 'bg-slate-100 text-ink-soft',
                )}
              >
                {i + 1}
              </span>
            )
          })}
        </div>
      )}

      {active && s && (
        s.overdue > 0 ? (
          <Callout color="red" icon={ExclamationTriangleIcon}>
            Người thuê đang nợ <b>{s.overdue} kỳ</b> ({fmtEth(l.rent * BigInt(s.overdue), 6)} ETH).{' '}
            {s.canEvict ? 'Đã nợ quá 1 kỳ: chủ nhà có quyền chấm dứt hợp đồng và khấu trừ cọc.' : `Nếu chưa trả, sau ${formatCountdown(s.paidUntil + l.periodLength - now)} chủ nhà có quyền chấm dứt hợp đồng.`}
          </Callout>
        ) : s.nextDueDate ? (
          <Callout color="green" icon={CheckCircleIcon}>
            Đã trả tới {fmtDate(s.paidUntil)}. Kỳ tiếp theo đến hạn sau <b>{formatCountdown(s.nextDueDate - now)}</b>.
          </Callout>
        ) : s.expired ? (
          <Callout color="yellow" icon={FlagIcon}>
            Hợp đồng đã hết hạn lúc {fmtDate(s.endDate)}, chờ chủ nhà quyết toán tiền cọc.
            {s.canClaim ? ' Đã quá thời hạn quyết toán: người thuê có thể tự nhận lại toàn bộ cọc.' : ` Nếu chủ nhà không quyết toán, sau ${formatCountdown(s.claimAt - now)} người thuê được tự nhận lại cọc.`}
          </Callout>
        ) : (
          <Callout color="green" icon={CheckCircleIcon}>
            Đã trả đủ {l.totalPeriods} kỳ. Hợp đồng hết hạn sau <b>{formatCountdown(s.endDate - now)}</b>.
          </Callout>
        )
      )}

      {l.status === STATUS.Ended && (
        <Callout color="blue" icon={FlagIcon}>
          Đã kết thúc. Hoàn cọc cho người thuê <b>{fmtEth(l.deposit - l.depositDeducted, 6)} ETH</b>
          {l.depositDeducted > 0n && <>, khấu trừ <b>{fmtEth(l.depositDeducted, 6)} ETH</b></>}
          {l.endNote && <> — {l.endNote}</>}
        </Callout>
      )}

      {(isLandlord || isTenant) && (l.status === STATUS.Pending || active) && !canAct && (
        <Callout color="yellow" icon={InformationCircleIcon}>
          {me ? `Ví MetaMask đang chọn không phải ví ${isLandlord ? 'chủ nhà' : 'người thuê'} của hợp đồng. Đổi tài khoản trong MetaMask để thao tác.` : 'Kết nối ví MetaMask để thao tác với hợp đồng.'}
        </Callout>
      )}

      {canAct && (
        <div className="space-y-3">
          {l.status === STATUS.Pending && isTenant && (
            <Section title="Ký hợp đồng & đặt cọc">
              <p className="text-sm text-ink-soft">Gửi tiền cọc {fmtEth(l.deposit, 6)} ETH (contract giữ tới khi kết thúc) + tiền phòng kỳ đầu {fmtEth(l.rent, 6)} ETH (chuyển cho chủ nhà).</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={act.sign}>✍️ Ký & thanh toán {fmtEth(l.deposit + l.rent, 6)} ETH</Button>
                <Button variant="secondary" disabled={busy} onClick={act.cancel}>Từ chối</Button>
              </div>
            </Section>
          )}
          {l.status === STATUS.Pending && isLandlord && (
            <Section title="Chờ người thuê ký">
              <p className="text-sm text-ink-soft">Người thuê chưa ký nên bạn có thể huỷ hợp đồng này.</p>
              <Button variant="danger" disabled={busy} onClick={act.cancel}>Huỷ hợp đồng</Button>
            </Section>
          )}

          {active && isTenant && s.remaining > 0 && (
            <Section title="Trả tiền phòng">
              {s.maxPayable > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: Math.min(s.maxPayable, 12) }, (_, i) => i + 1).map((n) => (
                      <button key={n} onClick={() => setPayCount(n)} className={clsx('rounded-full px-3 py-1 text-xs font-bold', count === n ? 'bg-gold-500 text-[#3e2600]' : 'bg-slate-100 text-ink hover:bg-slate-200')}>
                        {n} kỳ
                      </button>
                    ))}
                  </div>
                  <Button disabled={busy} onClick={() => act.pay(count)}>💸 Trả {count} kỳ ({fmtEth(l.rent * BigInt(count), 6)} ETH)</Button>
                  <p className="text-xs text-ink-soft">Được trả bù các kỳ còn nợ và trả trước tối đa kỳ kế tiếp. Tiền phòng cũng có thể trả qua hoá đơn tháng.</p>
                </>
              ) : (
                <p className="text-sm text-ink-soft">Bạn đã trả trước kỳ kế tiếp. Kỳ sau mở thanh toán lúc {fmtDate(s.paidUntil - l.periodLength)}.</p>
              )}
            </Section>
          )}

          {active && !s.expired && (
            <Section title="Gia hạn hợp đồng">
              {theirProposal ? (
                <>
                  <p className="text-sm">{nameOf(l.extensionBy)} đề xuất gia hạn thêm <b>{l.extensionPeriods} kỳ</b> (giữ nguyên giá thuê). Hết hạn mới: {fmtDate(s.endDate + l.extensionPeriods * l.periodLength)}.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={busy} onClick={act.accept}>✅ Đồng ý gia hạn</Button>
                    <Button variant="secondary" disabled={busy} onClick={act.cancelExt}>Từ chối</Button>
                  </div>
                </>
              ) : myProposal ? (
                <>
                  <p className="text-sm">Bạn đã đề xuất gia hạn thêm <b>{l.extensionPeriods} kỳ</b>, đang chờ {isLandlord ? 'người thuê' : 'chủ nhà'} đồng ý.</p>
                  <Button variant="secondary" disabled={busy} onClick={act.cancelExt}>Rút lại đề xuất</Button>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input className="input w-24" type="number" min="1" step="1" value={extendCount} onChange={(e) => setExtendCount(e.target.value)} aria-label="Số kỳ gia hạn" />
                  <span className="text-sm font-bold">kỳ</span>
                  <Button variant="gold" disabled={busy || !extendValid} onClick={() => act.propose(extendN)}>📅 Đề xuất gia hạn</Button>
                </div>
              )}
            </Section>
          )}

          {active && isLandlord && (
            <Section title="Trả phòng · Kết thúc hợp đồng & quyết toán cọc">
              {s.canEnd ? (
                <>
                  <p className="text-sm text-ink-soft">
                    {s.expired ? 'Hợp đồng đã hết hạn.' : `Người thuê nợ ${s.overdue} kỳ (quá 1 kỳ) nên bạn được chấm dứt hợp đồng.`} Kiểm tra thiết bị trong phòng, nhập số tiền khấu trừ (nếu có hư hỏng, nợ tiền…) — phần còn lại của cọc được hoàn cho người thuê.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={`Khấu trừ (ETH, tối đa ${fmtEth(l.deposit, 6)})`}>
                      <input className="input" type="number" min="0" step="0.01" value={deduction} onChange={(e) => setDeduction(e.target.value)} />
                    </Field>
                    <Field label="Lý do">
                      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd. Hỏng khoá cửa" maxLength={200} />
                    </Field>
                  </div>
                  {deductionError ? (
                    <p className="text-xs font-semibold text-red-600">{deductionError}</p>
                  ) : (
                    <p className="text-xs text-ink-soft">Hoàn cho người thuê: <b>{fmtEth(l.deposit - deductionWei, 6)} ETH</b> · Bạn nhận: <b>{fmtEth(deductionWei, 6)} ETH</b></p>
                  )}
                  <Button variant="danger" disabled={busy || !!deductionError} onClick={act.end}>🏁 Kết thúc & quyết toán cọc</Button>
                </>
              ) : (
                <p className="text-sm text-ink-soft">Được kết thúc khi hợp đồng hết hạn ({fmtDate(s.endDate)}) hoặc khi người thuê nợ tiền phòng quá 1 kỳ.</p>
              )}
            </Section>
          )}

          {active && isTenant && s.canClaim && (
            <Section title="Nhận lại tiền cọc">
              <p className="text-sm text-ink-soft">Chủ nhà chưa quyết toán sau thời hạn cho phép, bạn được tự nhận lại toàn bộ cọc.</p>
              <Button disabled={busy} onClick={act.claim}>↩️ Nhận lại {fmtEth(l.deposit, 6)} ETH tiền cọc</Button>
            </Section>
          )}
          {active && isTenant && !s.expired && (
            <Section title="Trả phòng trước hạn">
              <p className="text-sm text-ink-soft">Trả phòng trước {fmtDate(s.endDate)} thì <b>mất tiền cọc {fmtEth(l.deposit, 6)} ETH</b> (chuyển cho chủ nhà).</p>
              <Button variant="secondary" disabled={busy} onClick={act.terminate}>Chấm dứt hợp đồng</Button>
            </Section>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="font-bold text-ink">Nhật ký hợp đồng (từ blockchain)</h4>
        {events == null ? (
          <Loading />
        ) : events.length === 0 ? (
          <p className="text-sm text-ink-soft">Backend chưa đồng bộ sự kiện nào của hợp đồng này.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {events.map((ev, i) => {
              const d = describeEvent(ev, nameOf)
              return (
                <li key={`${ev.txHash}-${i}`} className="flex gap-3 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100">{d.icon}</span>
                  <span className="min-w-0">
                    <b className="block text-sm">{d.title}</b>
                    <span className="block text-xs text-ink-soft">{d.text}</span>
                    <span className="block text-[11px] text-ink-soft/80" title={ev.txHash}>{fmtDate(ev.time, true)} · block #{ev.blockNumber} · tx {shortAddress(ev.txHash)}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

/** Hộp thoại chi tiết hợp đồng, mở từ bất kỳ trang nào bằng useApp().openLease(id). */
export default function LeaseDetailModal() {
  const { openLeaseId, openLease, leases } = useApp()
  const lease = leases.find((l) => l.id === openLeaseId)
  if (!openLeaseId) return null
  return (
    <Modal open onClose={() => openLease(null)} title={`Hợp đồng #${openLeaseId}`} size="lg">
      {lease ? <Body key={lease.id} lease={lease} /> : <Loading text="Đang đọc hợp đồng từ blockchain…" />}
    </Modal>
  )
}
