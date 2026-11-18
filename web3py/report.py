"""Báo cáo các hợp đồng thuê đang có trên blockchain bằng Web3.py: trạng thái, số kỳ đã trả, số kỳ đang nợ.

    python report.py                        # tất cả hợp đồng
    python report.py --address 0xFFcf…      # chỉ hợp đồng mà ví là chủ nhà / người thuê
    python report.py --overdue              # chỉ hợp đồng đang nợ tiền thuê
"""
import argparse

from rental import STATUS, Web3, chain_time, connect, eth, fmt_time, lease_dict, lease_schedule, short


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rpc", help="RPC URL (mặc định lấy từ contracts/RentalManager.json)")
    parser.add_argument("--address", help="Chỉ hiện hợp đồng của địa chỉ ví này")
    parser.add_argument("--overdue", action="store_true", help="Chỉ hiện hợp đồng đang nợ tiền thuê")
    args = parser.parse_args()

    w3, rental, deployment = connect(args.rpc)
    now = chain_time(w3)
    count = rental.functions.leaseCount().call()

    if args.address:
        if not Web3.is_address(args.address):
            parser.error("Địa chỉ ví không hợp lệ")
        address = Web3.to_checksum_address(args.address)
        ids = rental.functions.getLeaseIdsOf(address).call()
        leases = [(i, lease_dict(rental.functions.getLease(i).call())) for i in ids]
    else:
        raw = rental.functions.getLeases(1, count).call() if count else []
        leases = [(i + 1, lease_dict(r)) for i, r in enumerate(raw)]

    print(f"\nContract {deployment['address']} · {count} hợp đồng · giờ blockchain {fmt_time(now)}\n")
    header = f"{'#':>3}  {'Phòng':<26} {'Chủ nhà':<13} {'Người thuê':<13} {'Trạng thái':<12} {'Tiền thuê/kỳ':>14} {'Đã trả':>7} {'Nợ':>3}  Hết hạn"
    print(header)
    print("-" * len(header))
    total_deposit = 0
    shown = 0
    for lease_id, l in leases:
        s = lease_schedule(l, now)
        overdue = s["overdue"] if s else 0
        if args.overdue and overdue == 0:
            continue
        if l["status"] == 1:
            total_deposit += l["deposit"]
        shown += 1
        name = l["roomName"] if len(l["roomName"]) <= 26 else l["roomName"][:25] + "…"
        print(
            f"{lease_id:>3}  {name:<26} {short(l['landlord']):<13} {short(l['tenant']):<13} {STATUS[l['status']]:<12} "
            f"{eth(l['rent']):>14} {l['paidPeriods']:>3}/{l['totalPeriods']:<3} {overdue:>3}  "
            f"{fmt_time(s['endDate']) if s else '—'}"
        )
    print(f"\n{shown} hợp đồng · tiền cọc contract đang giữ (hợp đồng đang thuê ở trên): {eth(total_deposit)}\n")


if __name__ == "__main__":
    main()
