"""Demo toàn bộ quy trình thuê nhà trên contract RentalManager bằng Web3.py.

Chủ nhà (tài khoản Ganache #1) tạo hợp đồng -> người thuê (#2) ký, đặt cọc, trả tiền thuê -> gia hạn
-> tua thời gian tới khi hết hạn -> chủ nhà quyết toán tiền cọc -> hai bên rút tiền -> xem lịch sử giao dịch.

    python demo_rental.py              # dùng RPC trong file deploy (Ganache 7545)
    python demo_rental.py --rpc http://127.0.0.1:8545
"""
import argparse

from rental import (
    STATUS,
    TX_TYPES,
    WEB3_VERSION,
    ZERO_ADDRESS,
    Web3,
    chain_time,
    connect,
    decode_events,
    eth,
    fmt_time,
    format_event,
    increase_time,
    lease_dict,
    revert_reason,
    short,
)

PERIOD = 300  # 1 kỳ = 5 phút để demo
RENT = Web3.to_wei(0.3, "ether")
DEPOSIT = Web3.to_wei(0.6, "ether")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rpc", help="RPC URL (mặc định lấy từ contracts/RentalManager.json)")
    args = parser.parse_args()

    w3, rental, deployment = connect(args.rpc)
    accounts = w3.eth.accounts
    landlord, tenant = accounts[1], accounts[2]
    users = [("Chủ nhà", landlord), ("Người thuê", tenant)]

    def send(label, fn, sender, value=0):
        tx_hash = fn.transact({"from": sender, "value": value})
        r = w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"  ✔ {label}")
        print(f"    tx hash : {r['transactionHash'].to_0x_hex()}")
        print(f"    block   : #{r['blockNumber']}   gas: {r['gasUsed']}")
        for ev in decode_events(rental, r):
            print(f"    event   : {format_event(ev)}")
        return r

    def blocked(label, fn, sender, value=0):
        try:
            fn.call({"from": sender, "value": value})
            print(f"  ✗ {label}: KHÔNG bị chặn")
        except Exception as err:  # ContractLogicError hoặc lỗi RPC của node
            print(f'  ✔ {label}: bị chặn — "{revert_reason(err)}"')

    def balances():
        for name, addr in users:
            in_contract = rental.functions.balances(addr).call()
            wallet = Web3.from_wei(w3.eth.get_balance(addr), "ether")
            print(f"    {name:<10} {short(addr)}  số dư trong contract: {eth(in_contract):<12} ví: {wallet:.4f} ETH")

    def show_lease(lease_id):
        l = lease_dict(rental.functions.getLease(lease_id).call())
        print(f"    #{lease_id} {l['roomName']} — {STATUS[l['status']]}")
        print(f"    đã trả {l['paidPeriods']}/{l['totalPeriods']} kỳ, tiền thuê {eth(l['rent'])}/kỳ, cọc {eth(l['deposit'])}")
        if l["startDate"]:
            print(
                f"    bắt đầu {fmt_time(l['startDate'])}, trả tới {fmt_time(rental.functions.paidUntil(lease_id).call())}, "
                f"hết hạn {fmt_time(rental.functions.endDate(lease_id).call())}"
            )
            print(f"    số kỳ đang nợ: {rental.functions.overduePeriods(lease_id).call()}  (giờ chain: {fmt_time(chain_time(w3))})")
        if l["extensionPeriods"]:
            print(f"    đề xuất gia hạn {l['extensionPeriods']} kỳ bởi {short(l['extensionBy'])}")
        return l

    chain_id = w3.eth.chain_id
    print(f"\n=== DEMO QUẢN LÝ NHÀ TRỌ (Web3.py {WEB3_VERSION}) — contract {deployment['address']} (chainId {chain_id}) ===\n")
    print("0) Số dư ban đầu")
    balances()

    print("\n1) CHỦ NHÀ TẠO HỢP ĐỒNG — createLease(): 0.3 ETH/kỳ, cọc 0.6 ETH, 3 kỳ × 5 phút")
    r = send(
        "createLease",
        rental.functions.createLease(tenant, "Phòng 101 - demo Web3.py", RENT, DEPOSIT, PERIOD, 3),
        landlord,
    )
    lease_id = decode_events(rental, r)[0]["args"]["leaseId"]
    show_lease(lease_id)

    print("\n2) NGƯỜI THUÊ KÝ HỢP ĐỒNG — signLease(): gửi cọc + tiền thuê kỳ đầu = 0.9 ETH")
    blocked("Người ngoài ký thay", rental.functions.signLease(lease_id), accounts[3], DEPOSIT + RENT)
    blocked("Người thuê gửi thiếu tiền", rental.functions.signLease(lease_id), tenant, RENT)
    send("signLease", rental.functions.signLease(lease_id), tenant, DEPOSIT + RENT)
    show_lease(lease_id)
    balances()

    print("\n3) TRẢ TIỀN THUÊ — payRent(): trả trước kỳ 2")
    send("payRent 1 kỳ", rental.functions.payRent(lease_id, 1), tenant, RENT)
    blocked("Trả trước thêm 1 kỳ nữa (quá 1 kỳ)", rental.functions.payRent(lease_id, 1), tenant, RENT)
    blocked("Chủ nhà kết thúc khi chưa hết hạn", rental.functions.endLease(lease_id, 0, ""), landlord)

    print("\n4) GIA HẠN — chủ nhà đề xuất thêm 1 kỳ, người thuê đồng ý")
    send("proposeExtension 1 kỳ", rental.functions.proposeExtension(lease_id, 1), landlord)
    blocked("Chủ nhà tự chấp nhận đề xuất của mình", rental.functions.acceptExtension(lease_id), landlord)
    send("acceptExtension", rental.functions.acceptExtension(lease_id), tenant)
    show_lease(lease_id)

    print("\n4b) HOÁ ĐƠN THÁNG — issueBill() / payBill(): 1 kỳ tiền phòng + dịch vụ (điện 95 số, nước 6 khối, internet, rác)")
    service = Web3.to_wei(0.0632, "ether")
    r = send(
        "issueBill",
        rental.functions.issueBill(lease_id, 1, service, "HD-demo 2026-11 P101: dien 95 so, nuoc 6 khoi"),
        landlord,
    )
    bill_id = decode_events(rental, r)[0]["args"]["billId"]
    bill = rental.functions.getBill(bill_id).call()
    blocked("Người thuê trả thiếu", rental.functions.payBill(bill_id), tenant, bill[3] - 1)
    send("payBill (kỳ tiền phòng được cộng vào hợp đồng)", rental.functions.payBill(bill_id), tenant, bill[3])
    show_lease(lease_id)

    print("\n5) TUA THỜI GIAN 4 kỳ (20 phút) — evm_increaseTime: hợp đồng hết hạn, người thuê còn nợ 1 kỳ")
    increase_time(w3, 4 * PERIOD)
    show_lease(lease_id)
    send("payRent 1 kỳ (trả bù)", rental.functions.payRent(lease_id, 1), tenant, RENT)

    print("\n6) QUYẾT TOÁN TIỀN CỌC — endLease(): khấu trừ 0.1 ETH vì hỏng khoá cửa")
    blocked("Khấu trừ vượt tiền cọc", rental.functions.endLease(lease_id, DEPOSIT + 1, "x"), landlord)
    blocked("Khấu trừ không ghi lý do", rental.functions.endLease(lease_id, Web3.to_wei(0.1, "ether"), ""), landlord)
    send(
        "endLease",
        rental.functions.endLease(lease_id, Web3.to_wei(0.1, "ether"), "Hỏng khoá cửa"),
        landlord,
    )
    l = show_lease(lease_id)
    print(f"    khấu trừ: {eth(l['depositDeducted'])} — lý do: {l['endNote']}")
    balances()

    print("\n7) RÚT TIỀN — withdraw(): hai bên rút số dư về ví")
    for name, addr in users:
        amount = rental.functions.balances(addr).call()
        send(f"{name} rút {eth(amount)}", rental.functions.withdraw(amount), addr)
    blocked("Rút quá số dư", rental.functions.withdraw(1), tenant)
    balances()

    print("\n8) LỊCH SỬ GIAO DỊCH lưu trên blockchain — getHistoryCount() / getHistory()")
    for name, addr in users:
        count = rental.functions.getHistoryCount(addr).call()
        start = max(0, count - 8)
        print(f"  {name} ({count} giao dịch, hiện tối đa 8 gần nhất):")
        for tx_type, lid, counterparty, amount, ts in rental.functions.getHistory(addr, start, 8).call():
            who = "" if counterparty == ZERO_ADDRESS else f"  đối ứng {short(counterparty)}"
            ref = f"hợp đồng #{lid}" if lid else ""
            print(f"    - {TX_TYPES[tx_type]:<18} {eth(amount):<10} {ref:<14} {fmt_time(ts)}{who}")
    print("\n=== HOÀN TẤT ===\n")


if __name__ == "__main__":
    main()
