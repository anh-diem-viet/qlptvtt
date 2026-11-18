"""Tiện ích dùng chung cho các script Web3.py: kết nối node, nạp contract RentalManager đã deploy, định dạng số liệu."""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from eth_abi import decode as abi_decode
from web3 import Web3, __version__ as WEB3_VERSION
from web3.exceptions import ContractLogicError
from web3.logs import DISCARD

# In tiếng Việt trên console Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
# File sinh bởi `npm run deploy:ganache` (smart-contract/) hoặc `python deploy.py`
DEPLOYMENT_FILE = HERE / "contracts" / "RentalManager.json"
ARTIFACT_FILE = HERE.parent / "smart-contract" / "artifacts" / "contracts" / "RentalManager.sol" / "RentalManager.json"
DEFAULT_RPC_URL = "http://127.0.0.1:7545"  # Ganache

STATUS = ["Chờ ký", "Đang thuê", "Đã kết thúc", "Đã huỷ"]
TX_TYPES = ["Đặt cọc", "Trả tiền thuê", "Nhận tiền thuê", "Nhận lại cọc", "Nhận cọc khấu trừ", "Rút về ví"]
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


def load_deployment():
    if not DEPLOYMENT_FILE.exists():
        sys.exit(
            f"Chưa có {DEPLOYMENT_FILE.relative_to(HERE.parent)} — hãy deploy contract trước "
            "(cd smart-contract && npm run deploy:ganache, hoặc python deploy.py)."
        )
    return json.loads(DEPLOYMENT_FILE.read_text(encoding="utf-8"))


def connect(rpc_url=None):
    """Trả về (w3, contract, deployment)."""
    deployment = load_deployment()
    w3 = Web3(Web3.HTTPProvider(rpc_url or deployment.get("rpcUrl") or DEFAULT_RPC_URL))
    if not w3.is_connected():
        sys.exit(f"Không kết nối được node tại {w3.provider.endpoint_uri} — Ganache đã chạy chưa? (npm run ganache)")
    if w3.eth.get_code(deployment["address"]) in (b"", b"\x00"):
        sys.exit(
            f"Không có contract tại {deployment['address']} — blockchain đã khởi động lại? Hãy deploy lại contract."
        )
    contract = w3.eth.contract(address=deployment["address"], abi=deployment["abi"])
    return w3, contract, deployment


def eth(wei):
    """wei -> '0.3 ETH'."""
    v = Web3.from_wei(wei, "ether")
    return f"{v.normalize():f} ETH" if v else "0 ETH"


def short(addr):
    return f"{addr[:6]}…{addr[-4:]}" if addr else ""


def fmt_time(ts):
    return datetime.fromtimestamp(ts).strftime("%d/%m/%Y %H:%M:%S") if ts else "—"


def chain_time(w3):
    return w3.eth.get_block("latest")["timestamp"]


def increase_time(w3, seconds):
    """Tua thời gian blockchain (Ganache / Hardhat node) rồi đào 1 block để áp dụng."""
    w3.provider.make_request("evm_increaseTime", [seconds])
    w3.provider.make_request("evm_mine", [])


def revert_reason(err):
    """Lý do revert của contract từ lỗi web3.py (Ganache / Hardhat định dạng khác nhau)."""
    data = getattr(err, "data", None)
    if isinstance(data, str) and data.startswith("0x08c379a0"):  # Error(string) chuẩn ABI
        return abi_decode(["string"], bytes.fromhex(data[10:]))[0]
    msg = str(err.message if isinstance(err, ContractLogicError) and err.message else err)
    m = re.search(r"(?:execution reverted: |revert |reason string )'?([^'\"\\\n]+)", msg)
    return m.group(1).strip() if m else msg


def decode_events(contract, receipt):
    """Giải mã toàn bộ sự kiện của contract trong một receipt."""
    out = []
    for item in contract.abi:
        if item.get("type") != "event":
            continue
        for ev in getattr(contract.events, item["name"])().process_receipt(receipt, errors=DISCARD):
            out.append(ev)
    return sorted(out, key=lambda e: e["logIndex"])


def format_event(ev):
    parts = []
    for k, v in ev["args"].items():
        if isinstance(v, int) and k in ("rent", "deposit", "amount", "refunded", "deducted"):
            v = eth(v)
        elif isinstance(v, str) and v.startswith("0x") and len(v) == 42:
            v = short(v)
        parts.append(f"{k}={v}")
    return f"{ev['event']}({', '.join(parts)})"


def lease_schedule(lease, now):
    """Lịch thanh toán của hợp đồng tại thời điểm `now` — cùng công thức với contract."""
    start, period = lease["startDate"], lease["periodLength"]
    if not start:
        return None
    end = start + lease["totalPeriods"] * period
    due = min(lease["totalPeriods"], max(0, now - start) // period + 1)
    overdue = max(0, due - lease["paidPeriods"]) if lease["status"] == 1 else 0
    return {
        "endDate": end,
        "paidUntil": start + lease["paidPeriods"] * period,
        "overdue": overdue,
        "expired": now >= end,
    }


def lease_dict(raw):
    """Struct Lease (tuple) -> dict theo tên trường trong ABI."""
    keys = [
        "landlord", "tenant", "roomName", "rent", "deposit", "periodLength", "totalPeriods", "paidPeriods",
        "createdAt", "startDate", "status", "extensionPeriods", "extensionBy", "depositDeducted", "endNote",
    ]
    return dict(zip(keys, raw))
