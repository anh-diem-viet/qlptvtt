# Báo cáo kiểm thử hệ thống

**Thời gian:** 18/11/2026 · **Kết quả:** 24/24 unit test, 20/20 bước luồng API, 15/15 bước giao diện đạt

## Môi trường

| Thành phần | Giá trị |
|---|---|
| Blockchain | Ganache, `http://127.0.0.1:7545`, chainId 1337 |
| Smart contract | `RentalManager` (Solidity 0.8.24) |
| Backend | Express, `http://localhost:4000`, MySQL 8.4 (Docker, cổng 3308) |
| Frontend | React + Vite + Tailwind CSS |
| Python | Web3.py 7.16.0 |
| Trình duyệt | Microsoft Edge (headless, tự động bằng Playwright) |

## Cách kiểm thử

- **Unit test** (`npm test` trong `smart-contract/`): chạy trên mạng Hardhat, dùng `time.increase` để kiểm tra đến hạn, quá hạn, hết hạn.
- **Luồng API + contract**: script Node gọi API backend bằng 2 tài khoản test và gửi giao dịch thật lên Ganache.
- **Giao diện**: 2 trình duyệt (chủ nhà, người thuê). Bước đăng nhập Google cần người thật nên 2 tài khoản test (`ChuNha_Lan`, `NguoiThue_Tuan`) được tạo sẵn trong MySQL; ví MetaMask được giả lập bằng cách chuyển request sang tài khoản Ganache #1, #2 (giao dịch thật, ký message thật). Thời gian được tua bằng `evm_increaseTime`.
- **Web3.py**: `demo_rental.py` chạy toàn bộ quy trình trên Ganache.

## 1. Unit test smart contract (24/24 đạt)

| Nhóm | Trường hợp |
|---|---|
| Tạo hợp đồng | Tạo, phát sự kiện, lưu đúng thông tin · chặn dữ liệu không hợp lệ (người thuê 0x0 / chính mình, tên rỗng, tiền 0, kỳ quá ngắn, số kỳ 0 hoặc > 240) · huỷ khi chưa ký, người ngoài bị chặn |
| Ký & trả tiền | Ký: cọc ở lại contract, kỳ đầu về chủ nhà · chỉ người thuê ký, đúng số tiền · trả trước kỳ kế tiếp, trả bù nhiều kỳ nợ · chặn sai số tiền, trả trước quá 1 kỳ, vượt số kỳ |
| Gia hạn | Một bên đề xuất, bên kia đồng ý · từ chối / rút lại · hết hạn không gia hạn được · trả tiếp các kỳ mới |
| Tiền cọc | Hết hạn: khấu trừ có lý do, hoàn phần còn lại · chặn kết thúc sớm, khấu trừ quá cọc, thiếu lý do · nợ quá 1 kỳ: chủ nhà được chấm dứt · chấm dứt sớm mất cọc · chủ nhà không quyết toán: người thuê tự nhận cọc · còn nợ thì không tự nhận được |
| Hoá đơn tháng | Phát hành / thanh toán đúng số tiền · chỉ chủ nhà phát hành, huỷ; người ngoài không trả thay; hoá đơn huỷ không trả được · hoá đơn gồm tiền phòng cộng kỳ vào hợp đồng · hoá đơn cũ vẫn trả được sau khi kết thúc |
| Ví & lịch sử | Rút tiền, chặn rút quá số dư · lịch sử giao dịch hai bên, phân trang · danh sách hợp đồng phân trang · hợp đồng không cọc |

## 2. Luồng API + contract (20/20 đạt)

Dịch vụ mặc định (điện, nước, internet, rác, gửi xe) · thêm 3 phòng, thiết bị · khách tìm phòng, gửi yêu cầu (chặn gửi trùng) · chủ nhà tạo hợp đồng, gắn với phòng (backend kiểm tra trên chain) · khách ký → phòng "Đã thuê", hồ sơ khách tự tạo, yêu cầu "Đã tạo hợp đồng" · chặn chỉ số mới < cũ · chỉ số cũ tháng sau tự lấy từ tháng trước · tạo hoá đơn: phòng 0.3 + dịch vụ 0.0632 = 0.3632 ETH · chặn gắn hoá đơn không tồn tại trên chain · xuất, thanh toán → phiếu thu "Blockchain", hợp đồng tăng lên 2/6 kỳ · thu chi, tổng quan, bảng HOPDONG.

## 3. Giao diện (15/15 đạt)

| # | Chức năng | Kết quả thực tế | Ảnh |
|---|---|---|---|
| G01 | Trang đăng nhập Google | Nút "Đăng nhập bằng Google" hiển thị | [01](screenshots/01-login.png) |
| G02 | Chủ nhà thêm phòng P202 | "Đã thêm phòng P202" | [07](screenshots/07-rooms.png) |
| G03 | Khách tìm phòng, gửi yêu cầu thuê P102 | "Đã gửi yêu cầu thuê, chờ chủ nhà liên hệ hẹn xem phòng" | [02](screenshots/02-find-rooms.png) |
| G04 | Chủ nhà xem yêu cầu, tạo hợp đồng trên blockchain | "Đã tạo hợp đồng #2 cho NguoiThue_Tuan, chờ khách ký và đặt cọc" | [03](screenshots/03-rooms-requests.png), [04](screenshots/04-create-lease.png) |
| G05 | Khách ký hợp đồng & đặt cọc | "Đã ký hợp đồng #2, chúc bạn ở vui vẻ!" | [05](screenshots/05-sign-lease.png), [06](screenshots/06-lease-active.png) |
| G06 | Phòng tự chuyển "Đã thuê", hồ sơ khách | P102 "Đã thuê"; thêm khách Trần Thị Mai (CCCD, SĐT) | [07](screenshots/07-rooms.png), [08](screenshots/08-tenants.png) |
| G07 | Ghi chỉ số, chặn nhập sai | Ô tiêu thụ tô đỏ, nút Lưu bị khoá; lưu được khi sửa đúng | [09](screenshots/09-usage-error.png), [10](screenshots/10-usage.png) |
| G08 | Tạo hoá đơn tháng, xuất lên blockchain | 2 hoá đơn "Chờ thanh toán" | [11](screenshots/11-invoices.png), [12](screenshots/12-invoice-detail.png) |
| G09 | Khách thanh toán bằng ví | "Đã thanh toán hoá đơn phòng P102", trạng thái "Đã thu đủ" | [13](screenshots/13-my-invoices.png) |
| G10 | Phiếu thu tiền mặt trả thiếu | Hoá đơn P101 "Còn nợ" | [14](screenshots/14-invoices-paid.png) |
| G11 | Sổ thu chi | Thu (blockchain, phiếu thu) + chi nhập tay "Sửa máy bơm" | [15](screenshots/15-cashflow.png) |
| G12 | Dashboard tổng quan | Tỷ lệ lấp đầy 50%, công nợ, doanh thu theo tháng | [16](screenshots/16-overview.png) |
| G13 | Trả phòng: trả hết kỳ, hết hạn, quyết toán cọc | "Đã kết thúc hợp đồng và quyết toán tiền cọc — phòng chuyển về Trống" | [17](screenshots/17-settle-deposit.png), [18](screenshots/18-lease-ended.png) |
| G14 | Lịch sử giao dịch trên blockchain | Danh sách đặt cọc, tiền phòng, hoá đơn, hoàn cọc | [19](screenshots/19-tx-history.png) |
| G15 | Giao diện điện thoại | Bố cục 1 cột, menu thu gọn | [20](screenshots/20-mobile.png) |

## Lỗi phát hiện và đã sửa trong quá trình kiểm thử

- Lưu chỉ số một phòng làm mất các ô đang nhập dở của phòng khác → mỗi dòng chỉ nạp lại khi dữ liệu đã lưu của chính nó thay đổi.
- Phần gợi ý của ô nhập nằm trong thẻ `<label>` làm tên ô nhập bị dài (ảnh hưởng trình đọc màn hình) → tách gợi ý ra ngoài nhãn.
