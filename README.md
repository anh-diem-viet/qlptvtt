# Hợp đồng thông minh quản lý nhà trọ và thanh toán tiền thuê

## Giới thiệu

Đề tài **Hợp đồng thông minh quản lý nhà trọ và thanh toán tiền thuê**: chủ nhà tạo hợp đồng thuê, người thuê thanh toán, xử lý tiền cọc và gia hạn. Smart contract viết bằng **Solidity**, chạy trên **Ganache**, biên dịch và thử trực tiếp được trên **Remix IDE**, tương tác bằng **Web3.py**.

Để hợp đồng được dùng như ngoài thực tế, dự án đi trọn luồng quản lý một khu trọ:

```
[Khách tìm phòng] → [Xem phòng & thoả thuận] → [Ký hợp đồng & thu tiền cọc] → phòng "Đã thuê"
→ [Quản lý hằng tháng: ghi chỉ số điện nước, tính tiền phòng + dịch vụ, xuất hoá đơn]
→ [Thanh toán & thu tiền] → ghi nhận công nợ / doanh thu
→ [Kết thúc hợp đồng / trả phòng] → hoàn / trừ tiền cọc → phòng "Trống"
```

Mọi khoản tiền (tiền cọc, tiền phòng, hoá đơn tháng) đi qua smart contract: contract giữ tiền cọc (escrow), tự kiểm tra số tiền, thời hạn, quyền của từng bên — không ai sửa được lịch sử thanh toán. Dữ liệu vận hành và hồ sơ cá nhân (CCCD, số điện thoại) lưu trong MySQL, không đưa lên blockchain công khai.

### Tính năng chính

- **Hợp đồng thuê trên smart contract**: chủ nhà tạo hợp đồng (tiền phòng, tiền cọc, kỳ thanh toán, số kỳ), người thuê ký bằng cách gửi **tiền cọc + tiền phòng kỳ đầu** trong 1 giao dịch
- **Thanh toán tiền phòng** theo kỳ: trả bù kỳ còn nợ, trả trước tối đa 1 kỳ; theo dõi kỳ đã trả / quá hạn
- **Xử lý tiền cọc**: contract giữ cọc; hết hạn thì chủ nhà quyết toán (hoàn lại, khấu trừ phải ghi lý do); khách nợ quá 1 kỳ thì chủ nhà được chấm dứt; khách trả phòng sớm thì mất cọc; chủ nhà không quyết toán thì khách tự nhận lại cọc
- **Gia hạn hợp đồng**: một bên đề xuất, bên kia đồng ý mới có hiệu lực
- **Hoá đơn tháng trên blockchain**: tiền phòng + dịch vụ (điện, nước theo chỉ số; internet, rác, gửi xe cố định), khách trả bằng ví, kỳ tiền phòng tự cộng vào hợp đồng
- **Quản lý nhà trọ** (theo mẫu 6 sheet): danh sách phòng (màu theo trạng thái), khách thuê, chỉ số điện nước (chặn nhập sai), hoá đơn, thu chi, dashboard tổng quan (tỷ lệ lấp đầy, phòng trống, công nợ, doanh thu theo tháng)
- **Khách tìm phòng** và gửi yêu cầu thuê; chủ nhà tạo hợp đồng ngay từ yêu cầu
- **Thiết bị trong phòng** — căn cứ khấu trừ cọc khi trả phòng
- **Phiếu thu**: tự ghi khi khách trả trên blockchain, ghi tay khi thu tiền mặt / chuyển khoản
- **Tự tạo hoá đơn đầu tháng** cho các phòng đã đủ chỉ số
- **Đăng nhập bằng Google** (OAuth 2.0), **liên kết ví MetaMask** bằng chữ ký số
- **Lịch sử giao dịch lưu trên blockchain**; rút tiền nhận được về MetaMask
- **Web3.py**: script deploy, demo toàn bộ quy trình, báo cáo hợp đồng

### Đối chiếu yêu cầu đề bài

| Yêu cầu | Đáp ứng |
|---|---|
| Chủ nhà tạo hợp đồng thuê | `createLease(tenant, roomName, rent, deposit, periodLength, totalPeriods)` — trang **Phòng trọ → Hợp đồng** |
| Người thuê thanh toán | `signLease(id)` (cọc + kỳ đầu), `payRent(id, n)`, `payBill(billId)` — trang **Phòng đang thuê**, **Hoá đơn của tôi** |
| Xử lý tiền cọc | Contract giữ cọc; `endLease(id, deduction, note)`, `terminateEarly(id)`, `claimDeposit(id)` |
| Gia hạn | `proposeExtension(id, n)` + `acceptExtension(id)` / `cancelExtension(id)` |
| Solidity | [smart-contract/contracts/RentalManager.sol](smart-contract/contracts/RentalManager.sol) |
| Remix | Mục [Chạy với Remix IDE](#6-chạy-với-remix-ide) — contract 1 file, không import thư viện ngoài |
| Web3.py | Thư mục [web3py/](web3py/): `deploy.py`, `demo_rental.py`, `report.py` |

> "Tiền" trong dự án là **ETH** (trên Ganache là ETH giả để test). Đơn giá mặc định quy đổi: điện ~3.500đ/kWh = 0.0004 ETH, nước ~15.000đ/m³ = 0.0018 ETH.

---

## Công nghệ sử dụng

### Frontend
- **Framework**: React 19 với Vite
- **Styling**: Tailwind CSS (bố cục header + sidebar + card, tone màu sáng)
- **Routing / State**: React Router v7, Zustand
- **UI Components**: Headless UI, Heroicons
- **HTTP Client**: Axios · **Notifications**: React Hot Toast
- **Blockchain**: Ethers.js v6 (đọc contract qua JSON-RPC, ký giao dịch qua MetaMask)
- **Hiệu ứng**: canvas-confetti

### Backend
- **Runtime**: Node.js (Express 5)
- **Database**: MySQL 8.4 (Docker), thư viện `mysql2` (raw SQL)
- **Authentication**: Google OAuth 2.0 (`google-auth-library`) + session token
- **Blockchain**: Ethers.js — xác minh chữ ký liên kết ví, kiểm tra hợp đồng / hoá đơn trên chain, đồng bộ sự kiện của contract vào MySQL
- **Tác vụ nền**: đồng bộ sự kiện (3 giây / lần), tự tạo hoá đơn tháng trước (mỗi giờ)

### Blockchain
- **Smart Contract**: Solidity 0.8.24
- **Network**: Ganache (chainId 1337, cổng 7545) hoặc Hardhat node (chainId 31337, cổng 8545)
- **Công cụ**: Hardhat (biên dịch, test, deploy), Remix IDE
- **Python**: Web3.py 7 (deploy, demo, báo cáo)
- **Wallet**: MetaMask

---

## Cấu trúc thư mục

```
qlptvtt/
├── smart-contract/                    # Hợp đồng thông minh (Hardhat)
│   ├── contracts/RentalManager.sol    # Hợp đồng thuê, tiền cọc, gia hạn, hoá đơn tháng, rút tiền
│   ├── scripts/deploy.js              # Deploy, ghi địa chỉ + ABI + RPC cho frontend/backend/web3py
│   ├── test/RentalManager.test.js     # 24 unit test
│   └── hardhat.config.js              # Mạng localhost (Hardhat) và ganache
├── web3py/                            # Script Python dùng Web3.py
│   ├── deploy.py                      # Deploy bằng Web3.py (thay cho npm run deploy:ganache)
│   ├── demo_rental.py                 # Demo toàn bộ quy trình thuê trên Ganache
│   ├── report.py                      # Báo cáo hợp đồng: trạng thái, số kỳ đã trả / đang nợ
│   ├── rental.py                      # Tiện ích dùng chung
│   └── requirements.txt
├── backend/                           # API Express + MySQL
│   ├── src/
│   │   ├── index.js                   # Entry point
│   │   ├── db.js                      # Kết nối MySQL, tạo bảng (ERD 8 bảng + bảng phụ)
│   │   ├── auth.js                    # Đăng nhập Google, nickname, liên kết ví
│   │   ├── manage.js                  # Phòng, khách thuê, hợp đồng, dịch vụ, chỉ số, hoá đơn, phiếu thu, thu chi, tổng quan
│   │   ├── indexer.js                 # Đồng bộ sự kiện contract vào MySQL
│   │   ├── sync.js                    # Cập nhật HOPDONG, PHIEUTHANHTOAN từ blockchain
│   │   ├── leases.js                  # Nhật ký hợp đồng, hoạt động gần đây
│   │   └── contracts/RentalManager.json   # Địa chỉ + ABI (sinh bởi deploy)
│   ├── docker-compose.yml             # MySQL 8.4 (cổng 3308)
│   └── .env.example
├── frontend/                          # Giao diện React + Tailwind
│   ├── src/
│   │   ├── components/                # layout (Header, Sidebar), common (Button, Card, Modal…), lease, InvoiceDetail
│   │   ├── pages/landlord/            # Tổng quan, Phòng trọ, Khách thuê, Hợp đồng, Chỉ số điện nước, Hoá đơn, Thu chi, Dịch vụ
│   │   ├── pages/tenant/              # Tìm phòng, Phòng đang thuê, Hoá đơn của tôi
│   │   ├── store/useApp.js            # Zustand: phiên đăng nhập, ví, dữ liệu blockchain
│   │   ├── lib/                       # rental.js (contract), api.js (axios), events.js, hooks.js
│   │   └── contracts/RentalManager.json
│   ├── tailwind.config.js
│   └── vite.config.js                 # Proxy /api → http://localhost:4000
└── docs/                              # Báo cáo kiểm thử + ảnh giao diện
```

---

## Hướng dẫn cài đặt & chạy

> Hướng dẫn chạy từng bước (Remix IDE với kịch bản thử từng hàm, Web3.py, toàn bộ hệ thống, lỗi thường gặp) gộp trong một file: **[HUONG_DAN_CHAY.md](HUONG_DAN_CHAY.md)**.

### Yêu cầu môi trường

- **Node.js** v22 trở lên, **npm**
- **Python** 3.10 trở lên (cho Web3.py)
- **Docker Desktop** để chạy MySQL (hoặc MySQL 8 cài sẵn — sửa `DB_*` trong `.env`)
- **MetaMask** cho trình duyệt
- **Ganache**: dùng bản CLI có sẵn trong dự án (`npm run ganache`) hoặc Ganache GUI

### 1. Clone repository và cài đặt

```bash
git clone <repository-url>
cd qlptvtt
cd smart-contract && npm install
cd ../backend && npm install
cd ../frontend && npm install
cd ../web3py && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # Linux/macOS: .venv/bin/pip
```

### 2. Cài đặt Database

```bash
cd backend
docker compose up -d
```

MySQL chạy ở cổng **3308**, database `nha_tro`, user `nhatro` / `nhatro`. **Không cần import file SQL**: backend tự tạo database và các bảng khi khởi động.

#### Database Schema (ERD 8 bảng chính)

| Bảng ERD | Bảng MySQL | Nội dung |
|---|---|---|
| PHONGTRO | `rooms` | Mã phòng, tên, tầng, diện tích, giá thuê, tiền cọc; trạng thái suy ra từ hợp đồng |
| KHACHHANG | `tenants` | Mã KH, họ tên, CCCD, SĐT, email, quê quán, phòng đang ở, ví, số người ở, link ảnh CCCD |
| HOPDONG | `leases` | Bản sao hợp đồng trên contract: phòng, khách, ngày bắt đầu / kết thúc, tiền cọc, số kỳ, trạng thái |
| DICHVU | `services` | Điện, nước (theo chỉ số), internet, rác, gửi xe (cố định): đơn giá, đơn vị tính |
| SUDUNGDV | `service_usage` | Chỉ số cũ / mới của từng dịch vụ, từng phòng, từng tháng |
| HOADON | `invoices` | Tiền phòng + tổng tiền dịch vụ = tổng tiền; mã hoá đơn trên chain |
| PHIEUTHANHTOAN | `payments` | Phiếu thu: ngày, số tiền, hình thức (blockchain / tiền mặt / chuyển khoản) |
| THIETBI | `equipment` | Đồ dùng trong phòng và tình trạng |

Bảng phụ: `users`, `sessions` (tài khoản Google), `room_requests` (yêu cầu thuê), `cash_entries` (sổ chi), `lease_events` (sự kiện đồng bộ từ blockchain), `meta`.

### 3. Chạy Ganache và deploy Smart Contract

```bash
cd smart-contract
npm run ganache            # Terminal 1: Ganache tại http://127.0.0.1:7545, chainId 1337
npm run deploy:ganache     # Terminal 2: deploy contract
```

Script deploy tự ghi địa chỉ contract, ABI và RPC vào `frontend/src/contracts/`, `backend/src/contracts/` và `web3py/contracts/`. Có thể deploy bằng Web3.py thay thế: `cd web3py && .venv/Scripts/python deploy.py` (cần chạy `npx hardhat compile` trước).

### 4. Cấu hình và chạy Backend

```bash
cd backend
cp .env.example .env       # điền GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
npm run dev
```

```env
PORT=4000
CLIENT_URL=http://localhost:5173
RPC_URL=http://127.0.0.1:7545
DB_HOST=127.0.0.1
DB_PORT=3308
DB_USER=nhatro
DB_PASSWORD=nhatro
DB_NAME=nha_tro
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
```

`GOOGLE_CALLBACK_URL` phải nằm trong **Authorized redirect URIs** của OAuth client (Google Cloud Console → APIs & Services → Credentials). Tắt tự tạo hoá đơn: `AUTO_INVOICE=false`.

### 5. Chạy Frontend

```bash
cd frontend
npm run dev
```

Frontend chạy tại `http://localhost:5173` (gọi backend qua proxy `/api`).

> Mỗi lần khởi động lại Ganache cần chạy lại `npm run deploy:ganache` (backend tự nhận contract mới và đồng bộ lại), và trong MetaMask vào *Settings → Advanced → Clear activity tab data* để tránh lỗi nonce.

### 6. Chạy với Remix IDE

Contract là một file Solidity không import thư viện ngoài, dán thẳng vào Remix được. Kịch bản thử đầy đủ 18 bước (đổi tài khoản, giá trị wei, kết quả mong đợi): [HUONG_DAN_CHAY.md — Phần 1](HUONG_DAN_CHAY.md#phần-1-chạy-smart-contract-trên-remix-ide).

1. Mở https://remix.ethereum.org, tạo file `RentalManager.sol`, dán nội dung [smart-contract/contracts/RentalManager.sol](smart-contract/contracts/RentalManager.sol).
2. Tab **Solidity Compiler**: chọn `0.8.24`, bật *Optimization* (200 runs), bấm **Compile**.
3. Tab **Deploy & Run Transactions**, chọn Environment **Remix VM**, hoặc **Dev - Ganache Provider** (`http://127.0.0.1:7545`), hoặc **Injected Provider - MetaMask**. Bấm **Deploy**.
4. Thử quy trình thuê (đổi Account trong Remix để đóng vai chủ nhà / người thuê; tiền tính bằng wei):
   - Chủ nhà `createLease`: `tenant` = địa chỉ người thuê, `roomName` = `P101`, `rent` = `300000000000000000` (0.3 ETH), `deposit` = `600000000000000000`, `periodLength` = `300` (5 phút), `totalPeriods` = `3`
   - Người thuê `signLease(1)` với **Value** = `900000000000000000` wei (cọc + kỳ đầu)
   - `payRent(1, 1)` với Value = tiền phòng; `paidUntil(1)`, `endDate(1)`, `overduePeriods(1)` để xem lịch
   - Gia hạn: một bên `proposeExtension(1, 2)`, bên kia `acceptExtension(1)`
   - Hoá đơn: chủ nhà `issueBill(1, 1, 63200000000000000, "HD1 2026-11 P101")`; người thuê `payBill(1)` với Value = `amount` của `getBill(1)`
   - Hết hạn: chủ nhà `endLease(1, 100000000000000000, "Hong khoa cua")`; hai bên `withdraw(amount)`
   - `getHistory(address, 0, 20)`: lịch sử giao dịch; terminal Remix hiện các event `LeaseCreated`, `LeaseSigned`, `RentPaid`, `BillPaid`, `LeaseEnded`…
5. Muốn web dùng contract deploy từ Remix: sửa `address` trong 3 file `contracts/RentalManager.json` (cùng mạng Ganache).

---

## Tài khoản demo

### Đăng nhập web

Dùng **tài khoản Google** bất kỳ. Lần đầu đăng nhập được hỏi đặt nickname. Một tài khoản dùng được cả hai vai trò: chủ nhà (menu **Chủ nhà**) và người thuê (menu **Người thuê**). Muốn thử cả hai bên trên một máy: dùng 2 trình duyệt / profile, mỗi bên đăng nhập một tài khoản Google và liên kết một ví.

### Ví MetaMask (Ganache, chạy với `--wallet.deterministic`)

Import private key vào MetaMask (*Add account → Import account*). Khi bấm **Kết nối ví**, app tự thêm mạng **Ganache Local** (chainId 1337, RPC `http://127.0.0.1:7545`).

| Tài khoản | Địa chỉ | Private key | Vai trò |
|------|----------|----------|-------|
| **#0** | `0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1` | `0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d` | Ví deploy contract |
| **#1** | `0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0` | `0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1` | Chủ nhà |
| **#2** | `0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b` | `0x6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c` | Người thuê |

> Đây là khoá công khai của Ganache dùng để test, **không bao giờ** dùng cho tiền thật. Khi tạo hợp đồng có thể chọn kỳ **1 phút / 5 phút** để thấy đến hạn, quá hạn, hết hạn ngay trong buổi demo.

### Demo bằng Web3.py

```bash
cd web3py
.venv/Scripts/python demo_rental.py     # demo toàn bộ quy trình (tự tua thời gian bằng evm_increaseTime)
.venv/Scripts/python report.py          # báo cáo các hợp đồng; --address 0x… hoặc --overdue
```

Trích kết quả [demo_rental.py](web3py/demo_rental.py) trên Ganache:

```
=== DEMO QUẢN LÝ NHÀ TRỌ (Web3.py 7.16.0) — contract 0x… (chainId 1337) ===
2) NGƯỜI THUÊ KÝ HỢP ĐỒNG — signLease(): gửi cọc + tiền thuê kỳ đầu = 0.9 ETH
  ✔ Người ngoài ký thay: bị chặn — "Chi nguoi thue duoc ky hop dong"
  ✔ Người thuê gửi thiếu tiền: bị chặn — "Phai gui dung tien coc + tien thue ky dau"
  ✔ signLease
    event   : LeaseSigned(leaseId=1, tenant=0x22d4…e32b, startDate=…)
    event   : RentPaid(leaseId=1, tenant=0x22d4…e32b, periods=1, amount=0.3 ETH, paidPeriods=1)
3) TRẢ TIỀN THUÊ — payRent(): trả trước kỳ 2
  ✔ Trả trước thêm 1 kỳ nữa (quá 1 kỳ): bị chặn — "Chi duoc tra truoc toi da 1 ky"
4) GIA HẠN — chủ nhà đề xuất thêm 1 kỳ, người thuê đồng ý
  ✔ Chủ nhà tự chấp nhận đề xuất của mình: bị chặn — "Ben con lai moi duoc chap nhan"
4b) HOÁ ĐƠN THÁNG — issueBill() / payBill(): 1 kỳ tiền phòng + dịch vụ
  ✔ payBill (kỳ tiền phòng được cộng vào hợp đồng)
    đã trả 3/4 kỳ, tiền thuê 0.3 ETH/kỳ, cọc 0.6 ETH
6) QUYẾT TOÁN TIỀN CỌC — endLease(): khấu trừ 0.1 ETH vì hỏng khoá cửa
  ✔ Khấu trừ vượt tiền cọc: bị chặn — "Khau tru vuot qua tien coc"
  ✔ endLease
    event   : LeaseEnded(leaseId=1, refunded=0.5 ETH, deducted=0.1 ETH, reason=expired, note=Hỏng khoá cửa)
```

### Unit test

```bash
cd smart-contract
npm test
```

24 test: tạo / huỷ hợp đồng, ký và đặt cọc, trả tiền phòng (trả bù, chặn trả trước quá 1 kỳ), gia hạn hai bên, quyết toán cọc (hết hạn, nợ quá 1 kỳ, chấm dứt sớm, khách tự nhận cọc), hoá đơn tháng (gồm tiền phòng), rút tiền, lịch sử giao dịch.

### Báo cáo kiểm thử

Kết quả kiểm thử toàn hệ thống (unit test, luồng API, 15 bước giao diện kèm ảnh): [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

---

## Kết quả và giao diện

### 1. Đăng nhập Google
![Đăng nhập](docs/screenshots/01-login.png)

### 2. Khách tìm phòng & gửi yêu cầu thuê
![Tìm phòng](docs/screenshots/02-find-rooms.png)
*Phòng trống của các chủ nhà, lọc theo giá; gửi yêu cầu kèm lời nhắn hẹn xem phòng*

### 3. Danh sách phòng & yêu cầu thuê mới
![Yêu cầu thuê](docs/screenshots/03-rooms-requests.png)
*Trạng thái phòng tô màu: Trống (đỏ), Chờ ký (vàng), Đã thuê (xanh)*

### 4. Tạo hợp đồng trên blockchain
![Tạo hợp đồng](docs/screenshots/04-create-lease.png)

### 5. Người thuê ký hợp đồng & đặt cọc
![Ký hợp đồng](docs/screenshots/05-sign-lease.png)
![Hợp đồng đang thuê](docs/screenshots/06-lease-active.png)

### 6. Phòng tự chuyển "Đã thuê", hồ sơ khách thuê
![Phòng trọ](docs/screenshots/07-rooms.png)
![Khách thuê](docs/screenshots/08-tenants.png)

### 7. Chỉ số điện nước (chặn nhập sai)
![Nhập sai chỉ số](docs/screenshots/09-usage-error.png)
![Chỉ số điện nước](docs/screenshots/10-usage.png)

### 8. Hoá đơn tháng: tạo, xuất lên blockchain, thanh toán
![Hoá đơn](docs/screenshots/11-invoices.png)
![Chi tiết hoá đơn](docs/screenshots/12-invoice-detail.png)
![Hoá đơn của tôi](docs/screenshots/13-my-invoices.png)
![Đã thu / còn nợ](docs/screenshots/14-invoices-paid.png)

### 9. Thu chi & tổng quan
![Thu chi](docs/screenshots/15-cashflow.png)
![Tổng quan](docs/screenshots/16-overview.png)

### 10. Trả phòng: quyết toán tiền cọc
![Quyết toán cọc](docs/screenshots/17-settle-deposit.png)
![Kết thúc hợp đồng](docs/screenshots/18-lease-ended.png)

### 11. Lịch sử giao dịch trên blockchain & điện thoại
![Lịch sử giao dịch](docs/screenshots/19-tx-history.png)
![Điện thoại](docs/screenshots/20-mobile.png)

---

## Bảo mật Smart Contract — Phân tích

### Lỗ hổng "chủ nhà tự giữ tiền cọc"

Cách làm thường gặp: người thuê chuyển cọc thẳng vào ví chủ nhà, khi trả phòng phụ thuộc hoàn toàn vào thiện chí của chủ nhà.

#### Vấn đề:
- Chủ nhà có thể không hoàn cọc, hoặc khấu trừ tuỳ ý không lý do
- Không có bằng chứng ai đã trả bao nhiêu, kỳ nào còn nợ
- Chủ nhà có thể "đuổi" người thuê dù người thuê vẫn trả đủ tiền

#### Cách khắc phục trong dự án:
✅ Tiền cọc nằm trong **smart contract** (escrow) suốt thời gian thuê, không bên nào rút riêng được  
✅ `endLease` chỉ gọi được khi **hết hạn** hoặc người thuê **nợ quá 1 kỳ**; khấu trừ ≤ tiền cọc và **bắt buộc ghi lý do** (lưu trên chain)  
✅ Chủ nhà không quyết toán sau 1 kỳ kể từ khi hết hạn → người thuê đã trả đủ được **tự nhận lại toàn bộ cọc** (`claimDeposit`)  
✅ Gia hạn cần **cả hai bên** đồng ý; hoá đơn chỉ chủ nhà phát hành, chỉ người thuê trả đúng số tiền  

### Các biện pháp an toàn khác

| Nguy cơ | Biện pháp |
|---|---|
| Reentrancy khi rút tiền | Tiền nhận được cộng vào số dư trong contract (pull payment); `withdraw` trừ số dư **trước** khi chuyển ETH |
| Trả sai số tiền | `signLease`, `payRent`, `payBill` yêu cầu `msg.value` khớp chính xác |
| Người thuê kẹt tiền trả trước | Chỉ được trả trước tối đa kỳ kế tiếp |
| Backend / client báo "đã thu" giả | Trạng thái hợp đồng, phiếu thu blockchain chỉ lấy từ **sự kiện của contract**; khi gắn hợp đồng / hoá đơn backend đọc lại trên chain để kiểm tra chủ sở hữu, số tiền |
| Gắn ví của người khác vào tài khoản | Liên kết ví bắt buộc **ký message**; backend xác minh chữ ký, mỗi ví chỉ thuộc một tài khoản |
| Lộ dữ liệu cá nhân | CCCD, SĐT, quê quán chỉ lưu ở MySQL; trên blockchain chỉ có địa chỉ ví và số tiền |
| CSRF khi đăng nhập Google | Tham số `state` ngẫu nhiên, dùng một lần, hết hạn sau 10 phút |
| Lộ secret | `backend/.env` không đưa lên git (`.gitignore`) |

### Đoạn code an toàn tiêu biểu

**File**: `smart-contract/contracts/RentalManager.sol`

```solidity
function endLease(uint256 leaseId, uint256 deduction, string calldata note) external exists(leaseId) {
    Lease storage l = leases[leaseId];
    require(l.status == Status.Active, "Hop dong khong hieu luc");
    require(msg.sender == l.landlord, "Chi chu nha duoc ket thuc hop dong");
    require(deduction <= l.deposit, "Khau tru vuot qua tien coc");
    require(deduction == 0 || bytes(note).length > 0, "Phai ghi ly do khau tru");

    string memory reason;
    if (block.timestamp >= endDate(leaseId)) {
        reason = "expired";
    } else {
        require(overduePeriods(leaseId) >= 2, "Hop dong chua het han va nguoi thue khong no qua 1 ky");
        reason = "non-payment";
    }
    _settle(leaseId, deduction, reason, note); // hoàn phần còn lại cho người thuê, khấu trừ cho chủ nhà
}

function withdraw(uint256 amount) external {
    require(amount > 0, "So tien rut phai lon hon 0");
    require(balances[msg.sender] >= amount, "So du khong du");
    balances[msg.sender] -= amount; // trừ trước khi chuyển để chống reentrancy
    _record(msg.sender, TxType.Withdraw, 0, address(0), amount);
    (bool ok, ) = payable(msg.sender).call{value: amount}("");
    require(ok, "Chuyen tien that bai");
    emit Withdrawn(msg.sender, amount);
}
```
