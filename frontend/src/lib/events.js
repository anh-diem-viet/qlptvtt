import { fmtEth } from './rental'

const END_REASONS = {
  expired: 'Hết hạn hợp đồng',
  'non-payment': 'Người thuê nợ tiền thuê quá 1 kỳ',
  'early-termination': 'Người thuê chấm dứt trước hạn',
  'deposit-claimed': 'Người thuê tự nhận lại cọc (chủ nhà không quyết toán)',
}

/**
 * Mô tả một sự kiện hợp đồng (đồng bộ từ blockchain qua backend) để hiện trong nhật ký / hoạt động.
 * `nameOf(address)` trả về tên hiển thị của ví.
 */
export function describeEvent(ev, nameOf) {
  const d = ev.data
  const who = ev.actor ? nameOf(ev.actor) : ''
  switch (ev.name) {
    case 'LeaseCreated':
      return {
        icon: '📝',
        title: 'Tạo hợp đồng',
        text: `${who} tạo hợp đồng cho ${nameOf(ev.tenant)}: ${fmtEth(d.rent)} ETH/kỳ, cọc ${fmtEth(d.deposit)} ETH, ${d.totalPeriods} kỳ`,
      }
    case 'LeaseCancelled':
      return { icon: '🚫', title: 'Huỷ hợp đồng', text: `${who} huỷ hợp đồng trước khi ký` }
    case 'LeaseSigned':
      return { icon: '✍️', title: 'Ký hợp đồng', text: `${who} ký hợp đồng và đặt cọc — hợp đồng bắt đầu có hiệu lực` }
    case 'RentPaid':
      return {
        icon: '💸',
        title: 'Trả tiền thuê',
        text: `${who} trả ${d.periods} kỳ (${fmtEth(d.amount)} ETH) — đã trả ${d.paidPeriods} kỳ`,
      }
    case 'ExtensionProposed':
      return { icon: '📅', title: 'Đề xuất gia hạn', text: `${who} đề xuất gia hạn thêm ${d.periods} kỳ` }
    case 'ExtensionCancelled':
      return { icon: '↩️', title: 'Huỷ đề xuất gia hạn', text: `${who} rút lại / từ chối đề xuất gia hạn` }
    case 'LeaseExtended':
      return { icon: '✅', title: 'Gia hạn hợp đồng', text: `Gia hạn thêm ${d.periods} kỳ, tổng ${d.totalPeriods} kỳ` }
    case 'LeaseEnded': {
      const parts = [`Hoàn cọc ${fmtEth(d.refunded)} ETH`]
      if (d.deducted !== '0') parts.push(`khấu trừ ${fmtEth(d.deducted)} ETH`)
      if (d.note) parts.push(`lý do: ${d.note}`)
      return { icon: '🏁', title: END_REASONS[d.reason] || 'Kết thúc hợp đồng', text: parts.join(' · ') }
    }
    case 'BillIssued':
      return {
        icon: '🧾',
        title: 'Phát hành hoá đơn',
        text: `Hoá đơn #${d.billId}: ${fmtEth(d.amount)} ETH${Number(d.rentPeriods) ? ` (gồm ${d.rentPeriods} kỳ tiền phòng)` : ''} — ${d.memo}`,
      }
    case 'BillPaid':
      return { icon: '✅', title: 'Thanh toán hoá đơn', text: `${who} trả hoá đơn #${d.billId}: ${fmtEth(d.amount)} ETH` }
    case 'BillCancelled':
      return { icon: '🚫', title: 'Huỷ hoá đơn', text: `Hoá đơn #${d.billId} đã bị huỷ` }
    default:
      return { icon: '•', title: ev.name, text: '' }
  }
}

export function endReasonLabel(reason) {
  return END_REASONS[reason] || reason
}
