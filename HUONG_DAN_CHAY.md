# Hướng dẫn chạy dự án

Hợp đồng thông minh quản lý nhà trọ và thanh toán tiền thuê — Solidity, Remix, Web3.py.

- [Phần 1. Chạy smart contract trên Remix IDE](#phần-1-chạy-smart-contract-trên-remix-ide) — không cần cài gì, chỉ cần trình duyệt
- [Phần 2. Chạy bằng Web3.py](#phần-2-chạy-bằng-web3py)
- [Phần 3. Chạy toàn bộ hệ thống (web + backend + MySQL)](#phần-3-chạy-toàn-bộ-hệ-thống-web--backend--mysql)
- [Lỗi thường gặp](#lỗi-thường-gặp)

---

## Phần 1. Chạy smart contract trên Remix IDE

### 1.1. Tạo file và biên dịch

1. Mở https://remix.ethereum.org
2. Ở tab **File explorer**, chuột phải thư mục `contracts` → **New File** → đặt tên `RentalManager.sol`.
3. Dán toàn bộ nội dung file [smart-contract/contracts/RentalManager.sol](smart-contract/contracts/RentalManager.sol) vào (contract chỉ có 1 file, không import thư viện ngoài).
4. Sang tab **Solidity Compiler**:
   - **Compiler**: chọn `0.8.24+commit...`
   - Mở **Advanced Configurations**: tích **Enable optimization**, để `200` runs. Nếu sẽ deploy lên **Ganache** thì chọn **EVM version** = `paris` (xem [Lỗi thường gặp](#lỗi-thường-gặp)); chạy trên Remix VM thì để mặc định.
   - Bấm **Compile RentalManager.sol** → hiện dấu ✓ xanh là thành công.

### 1.2. Deploy

Sang tab **Deploy & Run Transactions**:

1. **Environment**: chọn **Remix VM** (blockchain giả lập ngay trong trình duyệt, có sẵn nhiều tài khoản 100 ETH).
2. **Contract**: chọn `RentalManager`.
3. Bấm **Deploy**. Contract hiện ở mục **Deployed Contracts** phía dưới; bấm mũi tên để mở danh sách hàm.

Trong kịch bản dưới đây dùng 3 tài khoản của Remix VM (chọn ở ô **Account**, bấm biểu tượng copy cạnh ô để lấy địa chỉ):

| Vai trò | Tài khoản Remix VM |
|---|---|
| Chủ nhà | Account thứ 1 — `0x5B38Da6a701c568545dCfcB03FcB875f56beddC4` |
| Người thuê | Account thứ 2 — `0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2` |
| Người ngoài | Account thứ 3 — `0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db` |

> **Đổi tài khoản trước mỗi bước** theo cột "Tài khoản". Các nút màu **cam / đỏ** là hàm ghi (gửi giao dịch), nút **xanh** là hàm đọc (không tốn phí).
>
> Hàm có nhiều tham số: bấm mũi tên ⌄ bên cạnh tên hàm để nhập từng ô riêng; chuỗi (string) nhập thẳng, không cần dấu ngoặc kép.

### 1.3. Đổi ETH sang wei

Mọi số tiền trong contract tính bằng **wei** (1 ETH = 10¹⁸ wei). Ô **Value** (gửi kèm ETH) cũng để đơn vị **Wei**.

| ETH | wei |
|---|---|
| 0.1 | `100000000000000000` |
| 0.3 | `300000000000000000` |
| 0.6 | `600000000000000000` |
| 0.9 | `900000000000000000` |
| 0.0632 | `63200000000000000` |
| 0.3632 | `363200000000000000` |

### 1.4. Kịch bản thử từng chức năng

Hợp đồng mẫu: phòng **P101**, tiền phòng **0.3 ETH/kỳ**, cọc **0.6 ETH**, kỳ thanh toán **120 giây** (để thấy hết hạn ngay khi demo), **2 kỳ**.

| # | Tài khoản | Hàm / thao tác | Nhập | Kết quả mong đợi |
|---|---|---|---|---|
| 1 | Chủ nhà | `createLease` | `tenant` = địa chỉ người thuê · `roomName` = `P101` · `rent` = `300000000000000000` · `deposit` = `600000000000000000` · `periodLength` = `120` · `totalPeriods` = `2` | Giao dịch thành công; terminal hiện event `LeaseCreated`. Hợp đồng số **1**, trạng thái Chờ ký |
| 2 | Người thuê | `signLease` (Value = `300000000000000000` wei) | `leaseId` = `1` | **Bị chặn**: `Phai gui dung tien coc + tien thue ky dau` (gửi thiếu tiền) |
| 3 | Người thuê | `signLease` (Value = `900000000000000000` wei) | `leaseId` = `1` | Thành công: event `LeaseSigned`, `RentPaid`. Contract giữ 0.6 ETH cọc, chủ nhà nhận 0.3 ETH |
| 4 | — | `getLease` (xanh) | `1` | `status` = 1 (Đang thuê), `paidPeriods` = 1, `totalPeriods` = 2 |
| 5 | Người thuê | `payRent` (Value = `300000000000000000` wei) | `leaseId` = `1` · `periods` = `1` | Thành công, `paidPeriods` = 2/2 |
| 6 | Người thuê | `proposeExtension` | `leaseId` = `1` · `periods` = `1` | Thành công, event `ExtensionProposed` |
| 7 | Người thuê | `acceptExtension` | `1` | **Bị chặn**: `Ben con lai moi duoc chap nhan` |
| 8 | Chủ nhà | `acceptExtension` | `1` | Thành công, event `LeaseExtended`; `totalPeriods` = 3 |
| 9 | Chủ nhà | `issueBill` | `leaseId` = `1` · `rentPeriods` = `1` · `serviceAmount` = `63200000000000000` · `memo` = `HD1 P101 dien 95 so nuoc 6 khoi` | Thành công, event `BillIssued`. Gọi `getBill(1)`: `amount` = `363200000000000000` (0.3 phòng + 0.0632 dịch vụ) |
| 10 | Người thuê | `payBill` (Value = `363200000000000000` wei) | `billId` = `1` | Thành công: event `RentPaid` + `BillPaid`; `getLease(1)` → `paidPeriods` = 3/3 |
| 11 | Chủ nhà | `endLease` | `leaseId` = `1` · `deduction` = `100000000000000000` · `note` = `Hong khoa cua` | **Bị chặn** nếu chưa hết hạn: `Hop dong chua het han va nguoi thue khong no qua 1 ky` |
| 12 | Người thuê | `endLease` | `1` · `0` · (để trống) | **Bị chặn**: `Chi chu nha duoc ket thuc hop dong` |
| 13 | — | `endDate` (xanh) | `1` | Thời điểm hết hạn (unix giây) = lúc ký + 3 × 120 giây. **Chờ khoảng 6 phút** kể từ bước 3 |
| 14 | Chủ nhà | `endLease` (sau khi hết hạn) | `1` · `100000000000000000` · `Hong khoa cua` | Thành công: event `LeaseEnded` — hoàn **0.5 ETH** cho người thuê, khấu trừ **0.1 ETH** cho chủ nhà; `getLease(1)` → `status` = 2, `endNote` = `Hong khoa cua` |
| 15 | — | `balances` (xanh) | địa chỉ chủ nhà / người thuê | Chủ nhà `1063200000000000000` (3 kỳ phòng + dịch vụ + khấu trừ), người thuê `500000000000000000` |
| 16 | Người thuê | `withdraw` | `amount` = `500000000000000000` | Thành công: 0.5 ETH về ví người thuê (số dư Account tăng) |
| 17 | Người thuê | `withdraw` | `1` | **Bị chặn**: `So du khong du` |
| 18 | — | `getHistory` (xanh) | địa chỉ người thuê · `0` · `20` | 7 giao dịch: Đặt cọc, Trả tiền thuê ×3, Trả hoá đơn dịch vụ, Nhận lại cọc, Rút về ví |

Ý nghĩa mã loại giao dịch trong `getHistory` (`txType`): 0 Đặt cọc · 1 Trả tiền thuê · 2 Nhận tiền thuê · 3 Nhận lại cọc · 4 Nhận tiền cọc khấu trừ · 5 Rút về ví · 6 Trả hoá đơn dịch vụ · 7 Nhận tiền hoá đơn dịch vụ.

Ý nghĩa `status` của hợp đồng: 0 Chờ ký · 1 Đang thuê · 2 Đã kết thúc · 3 Đã huỷ.

> Kịch bản trên đã được chạy thử nguyên văn (cùng tham số) bằng Web3.py trên Ganache: mọi bước cho đúng kết quả trong bảng.

#### Các chức năng khác nên thử

| Tài khoản | Hàm | Ghi chú |
|---|---|---|
| Chủ nhà hoặc người thuê | `cancelLease(id)` | Huỷ hợp đồng **chưa ký**; người ngoài gọi bị chặn |
| Người thuê | `terminateEarly(id)` | Trả phòng trước hạn → **mất toàn bộ cọc** (chuyển cho chủ nhà) |
| Chủ nhà | `endLease` khi khách nợ | Tạo hợp đồng mới, khách ký nhưng không trả tiếp; sau 2 kỳ (khách nợ quá 1 kỳ, `overduePeriods` ≥ 2) chủ nhà được kết thúc sớm và trừ cọc |
| Người thuê | `claimDeposit(id)` | Khách đã trả đủ, hết hạn thêm 1 kỳ mà chủ nhà chưa quyết toán → khách tự nhận lại toàn bộ cọc |
| Chủ nhà / người thuê | `cancelExtension(id)` | Rút lại / từ chối đề xuất gia hạn |
| Chủ nhà | `cancelBill(billId)` | Huỷ hoá đơn chưa trả; trả hoá đơn đã huỷ sẽ bị chặn |
| — | `paidUntil(id)`, `overduePeriods(id)`, `getLeases(1, 10)`, `getLeaseIdsOf(địa chỉ)` | Các hàm đọc để xem lịch thanh toán, số kỳ nợ, danh sách hợp đồng |

### 1.5. Deploy từ Remix lên Ganache hoặc qua MetaMask

1. Bật Ganache: `cd smart-contract && npm run ganache` (cổng 7545, chainId 1337).
2. Ở tab **Solidity Compiler** chọn **EVM version** = `paris` rồi biên dịch lại.
3. Ở tab **Deploy & Run Transactions**, **Environment** chọn:
   - **Custom - External Http Provider** (bản cũ của Remix gọi là *Dev - Ganache Provider*) → nhập `http://127.0.0.1:7545`, hoặc
   - **Injected Provider - MetaMask** khi MetaMask đang ở mạng Ganache Local (chainId 1337) và đã import private key của tài khoản Ganache (xem [README](README.md#tài-khoản-demo)).
4. Deploy và chạy lại kịch bản ở mục 1.4 (dùng tài khoản Ganache #1 làm chủ nhà, #2 làm người thuê).
5. Muốn ứng dụng web dùng contract vừa deploy từ Remix: copy địa chỉ contract, sửa trường `address` trong 3 file `frontend/src/contracts/RentalManager.json`, `backend/src/contracts/RentalManager.json`, `web3py/contracts/RentalManager.json`.

---

## Phần 2. Chạy bằng Web3.py

Cần Ganache đang chạy (`npm run ganache` trong `smart-contract/`).

```bash
cd web3py
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt      # Linux/macOS: .venv/bin/pip

# Deploy (cần biên dịch trước: cd ../smart-contract && npx hardhat compile)
.venv\Scripts\python deploy.py

# Demo toàn bộ quy trình: tạo hợp đồng, ký & cọc, trả tiền, gia hạn, hoá đơn, tua thời gian, quyết toán cọc, rút tiền
.venv\Scripts\python demo_rental.py

# Báo cáo các hợp đồng trên blockchain
.venv\Scripts\python report.py
.venv\Scripts\python report.py --overdue
.venv\Scripts\python report.py --address 0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b
```

---

## Phần 3. Chạy toàn bộ hệ thống (web + backend + MySQL)

Yêu cầu: Node.js ≥ 22, Docker Desktop, trình duyệt có MetaMask.

```bash
# 1. Cài đặt (một lần)
cd smart-contract && npm install
cd ../backend && npm install
cd ../frontend && npm install

# 2. Terminal 1 — blockchain Ganache (cổng 7545)
cd smart-contract
npm run ganache

# 3. Terminal 2 — deploy contract (tự ghi địa chỉ + ABI cho frontend, backend, web3py)
cd smart-contract
npm run deploy:ganache

# 4. MySQL bằng Docker (cổng 3308; backend tự tạo database và bảng)
cd backend
docker compose up -d

# 5. Terminal 3 — backend (cổng 4000)
cd backend
copy .env.example .env        # Linux/macOS: cp .env.example .env — rồi điền GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
npm run dev

# 6. Terminal 4 — frontend (cổng 5173)
cd frontend
npm run dev
```

Mở http://localhost:5173 → **Đăng nhập bằng Google** → **Kết nối ví** (MetaMask tự thêm mạng Ganache Local) → liên kết ví bằng chữ ký.

Thử cả hai vai trò bằng **2 trình duyệt / 2 profile**: mỗi bên một tài khoản Google, import một private key Ganache khác nhau vào MetaMask (#1 làm chủ nhà, #2 làm người thuê — xem [README](README.md#tài-khoản-demo)). Luồng gợi ý:

1. Chủ nhà: **Phòng trọ → Thêm phòng**.
2. Người thuê: **Tìm phòng → Gửi yêu cầu thuê**.
3. Chủ nhà: **Phòng trọ → Tạo hợp đồng** (chọn kỳ **1 phút** hoặc **5 phút** để demo nhanh).
4. Người thuê: **Phòng đang thuê → Ký & thanh toán**.
5. Chủ nhà: **Chỉ số điện nước** → nhập chỉ số → **Hoá đơn → Tạo hoá đơn tháng → Xuất**.
6. Người thuê: **Hoá đơn của tôi → Thanh toán**.
7. Chủ nhà: **Tổng quan**, **Thu chi** để xem công nợ, doanh thu.
8. Khi hết hạn: chủ nhà mở hợp đồng → **Kết thúc & quyết toán cọc**; phòng về **Trống**.

Unit test contract: `cd smart-contract && npm test` (24 test).

---

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Deploy từ Remix lên Ganache báo lỗi `invalid opcode` / giao dịch thất bại ngay | Remix mặc định biên dịch cho EVM mới (cancun) mà Ganache 7 chưa hỗ trợ. Chọn **EVM version = paris** ở *Advanced Configurations* rồi biên dịch lại |
| Remix báo `Phai gui dung tien coc + tien thue ky dau` / `So tien khong dung` | Ô **Value** sai số tiền hoặc sai đơn vị — chọn đơn vị **Wei** và nhập đúng số ở bảng đổi đơn vị |
| `endLease` bị chặn `Hop dong chua het han…` | Chưa tới `endDate`. Remix VM dùng giờ thật: chờ đủ thời gian (gọi `endDate(1)` để xem). Trên Ganache có thể tua bằng Web3.py: `w3.provider.make_request("evm_increaseTime", [600])` rồi `evm_mine` |
| `payRent` bị chặn `Chi duoc tra truoc toi da 1 ky` | Đã trả trước kỳ kế tiếp; chờ tới kỳ sau |
| `issueBill` bị chặn `Vuot qua so ky cua hop dong` | Số kỳ tiền phòng trong hoá đơn vượt số kỳ còn lại — dùng `rentPeriods` = `0` (chỉ dịch vụ) hoặc gia hạn trước |
| MetaMask lỗi nonce sau khi khởi động lại Ganache | MetaMask → *Settings → Advanced → Clear activity tab data*, rồi chạy lại `npm run deploy:ganache` |
| Backend báo không kết nối được MySQL | Kiểm tra `docker compose up -d` đã chạy, cổng 3308 và `DB_*` trong `backend/.env` |
| Nút "Đăng nhập bằng Google" bị mờ | Chưa điền `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` trong `backend/.env` hoặc backend chưa chạy |
