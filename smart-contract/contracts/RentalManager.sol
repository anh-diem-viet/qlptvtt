// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Quản lý nhà trọ và thanh toán tiền thuê
/// @notice Chủ nhà tạo hợp đồng thuê cho một người thuê; người thuê ký hợp đồng bằng cách đặt cọc và trả kỳ đầu;
///         sau đó trả tiền thuê theo kỳ, hai bên có thể gia hạn. Khi hết hạn, chủ nhà quyết toán tiền cọc
///         (hoàn lại, có thể khấu trừ kèm lý do). Tiền cọc được contract giữ (escrow) suốt thời gian thuê.
///         Hằng tháng chủ nhà phát hành hoá đơn dịch vụ (điện, nước, rác, wifi), người thuê thanh toán trên chain.
/// @dev Không import thư viện ngoài, có thể dán thẳng vào Remix IDE để biên dịch.
///      Tiền thuê, tiền cọc hoàn lại... được cộng vào số dư trong contract, chủ nhân tự rút bằng withdraw()
///      (pull payment) để một địa chỉ nhận tiền bị lỗi không làm kẹt cả hợp đồng.
contract RentalManager {
    uint32 public constant MAX_PERIODS = 240;       // tối đa 240 kỳ (20 năm nếu kỳ = 1 tháng)
    uint64 public constant MIN_PERIOD = 60;          // kỳ ngắn nhất 60 giây (để demo)
    uint64 public constant MAX_PERIOD = 366 days;

    enum Status {
        Pending,   // chủ nhà đã tạo, chờ người thuê ký (đặt cọc + trả kỳ đầu)
        Active,    // đang thuê
        Ended,     // đã kết thúc và quyết toán tiền cọc
        Cancelled  // huỷ trước khi người thuê ký
    }

    enum TxType {
        DepositPaid,      // người thuê: đặt cọc (khoá trong contract)
        RentPaid,         // người thuê: trả tiền thuê
        RentReceived,     // chủ nhà: nhận tiền thuê
        DepositRefunded,  // người thuê: nhận lại tiền cọc
        DepositReceived,  // chủ nhà: nhận tiền cọc bị khấu trừ / người thuê bỏ cọc
        Withdraw,         // rút số dư về ví
        BillPaid,         // người thuê: trả hoá đơn dịch vụ (điện, nước, rác, wifi…)
        BillReceived      // chủ nhà: nhận tiền hoá đơn dịch vụ
    }

    /// @notice Hoá đơn tháng: tiền phòng (một số kỳ của hợp đồng) + tiền dịch vụ (điện, nước, internet, rác…).
    ///         Tiền dịch vụ do chủ nhà tính từ chỉ số điện nước (lưu ở backend); contract ghi nhận và nhận thanh toán.
    ///         Khi trả hoá đơn, số kỳ tiền phòng trong hoá đơn được cộng vào số kỳ đã trả của hợp đồng.
    struct Bill {
        uint256 leaseId;
        uint32 rentPeriods;    // số kỳ tiền phòng trong hoá đơn (0 = chỉ dịch vụ)
        uint256 rentAmount;    // = rent * rentPeriods (chốt lúc phát hành)
        uint256 amount;        // tổng hoá đơn = rentAmount + tiền dịch vụ
        string memo;           // vd. "HD12 2026-06 P101: dien 95 so, nuoc 6 khoi"
        bool paid;
        bool cancelled;
        uint64 issuedAt;
        uint64 paidAt;
    }

    struct Lease {
        address landlord;         // chủ nhà
        address tenant;           // người thuê
        string roomName;          // tên / địa chỉ phòng
        uint256 rent;             // tiền thuê mỗi kỳ (wei)
        uint256 deposit;          // tiền cọc (wei)
        uint64 periodLength;      // độ dài một kỳ (giây), vd. 30 ngày
        uint32 totalPeriods;      // tổng số kỳ thuê (tăng khi gia hạn)
        uint32 paidPeriods;       // số kỳ đã trả
        uint64 createdAt;
        uint64 startDate;         // thời điểm người thuê ký (0 khi chưa ký)
        Status status;
        uint32 extensionPeriods;  // số kỳ gia hạn đang được đề xuất (0 = không có đề xuất)
        address extensionBy;      // bên đề xuất gia hạn
        uint256 depositDeducted;  // tiền cọc bị khấu trừ khi kết thúc
        string endNote;           // lý do kết thúc / khấu trừ
    }

    struct Transaction {
        TxType txType;
        uint256 leaseId;       // 0 nếu không gắn với hợp đồng (rút tiền)
        address counterparty;  // bên kia của giao dịch, address(0) nếu không có
        uint256 amount;
        uint64 timestamp;
    }

    mapping(uint256 => Lease) private leases;
    mapping(address => uint256[]) private leaseIdsOf;    // hợp đồng mà địa chỉ là chủ nhà hoặc người thuê
    mapping(address => uint256) public balances;         // số dư có thể rút
    mapping(address => Transaction[]) private histories;
    uint256 public leaseCount;
    mapping(uint256 => Bill) private bills;
    mapping(uint256 => uint256[]) private billIdsOf;     // leaseId -> id hoá đơn
    uint256 public billCount;

    event BillIssued(uint256 indexed billId, uint256 indexed leaseId, uint256 amount, uint32 rentPeriods, string memo);
    event BillPaid(uint256 indexed billId, uint256 indexed leaseId, address indexed tenant, uint256 amount, uint256 rentAmount);
    event BillCancelled(uint256 indexed billId, uint256 indexed leaseId);
    event LeaseCreated(uint256 indexed leaseId, address indexed landlord, address indexed tenant, uint256 rent, uint256 deposit, uint32 totalPeriods);
    event LeaseCancelled(uint256 indexed leaseId, address by);
    event LeaseSigned(uint256 indexed leaseId, address indexed tenant, uint64 startDate);
    event RentPaid(uint256 indexed leaseId, address indexed tenant, uint32 periods, uint256 amount, uint32 paidPeriods);
    event ExtensionProposed(uint256 indexed leaseId, address indexed by, uint32 periods);
    event ExtensionCancelled(uint256 indexed leaseId, address indexed by);
    event LeaseExtended(uint256 indexed leaseId, uint32 periods, uint32 totalPeriods);
    event LeaseEnded(uint256 indexed leaseId, uint256 refunded, uint256 deducted, string reason, string note);
    event Withdrawn(address indexed user, uint256 amount);

    modifier exists(uint256 leaseId) {
        require(leaseId > 0 && leaseId <= leaseCount, "Hop dong khong ton tai");
        _;
    }

    // ---------------- Chủ nhà tạo hợp đồng ----------------

    /// @notice Chủ nhà tạo hợp đồng thuê cho `tenant`. Hợp đồng có hiệu lực khi người thuê gọi signLease.
    /// @param rent Tiền thuê mỗi kỳ (wei).
    /// @param deposit Tiền cọc (wei), có thể bằng 0.
    /// @param periodLength Độ dài một kỳ thanh toán (giây), vd. 2592000 = 30 ngày.
    /// @param totalPeriods Số kỳ thuê, vd. 12 kỳ = 1 năm.
    function createLease(
        address tenant,
        string calldata roomName,
        uint256 rent,
        uint256 deposit,
        uint64 periodLength,
        uint32 totalPeriods
    ) external returns (uint256 leaseId) {
        require(tenant != address(0), "Dia chi nguoi thue khong hop le");
        require(tenant != msg.sender, "Chu nha khong the tu thue phong cua minh");
        require(bytes(roomName).length > 0 && bytes(roomName).length <= 100, "Ten phong dai 1-100 byte");
        require(rent > 0, "Tien thue phai lon hon 0");
        require(periodLength >= MIN_PERIOD && periodLength <= MAX_PERIOD, "Do dai ky khong hop le");
        require(totalPeriods > 0 && totalPeriods <= MAX_PERIODS, "So ky thue khong hop le");

        leaseId = ++leaseCount;
        Lease storage l = leases[leaseId];
        l.landlord = msg.sender;
        l.tenant = tenant;
        l.roomName = roomName;
        l.rent = rent;
        l.deposit = deposit;
        l.periodLength = periodLength;
        l.totalPeriods = totalPeriods;
        l.createdAt = uint64(block.timestamp);
        l.status = Status.Pending;
        leaseIdsOf[msg.sender].push(leaseId);
        leaseIdsOf[tenant].push(leaseId);
        emit LeaseCreated(leaseId, msg.sender, tenant, rent, deposit, totalPeriods);
    }

    /// @notice Huỷ hợp đồng chưa ký: chủ nhà rút lại lời mời, hoặc người thuê từ chối.
    function cancelLease(uint256 leaseId) external exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Pending, "Chi huy duoc hop dong chua ky");
        require(msg.sender == l.landlord || msg.sender == l.tenant, "Ban khong thuoc hop dong nay");
        l.status = Status.Cancelled;
        emit LeaseCancelled(leaseId, msg.sender);
    }

    // ---------------- Người thuê ký và thanh toán ----------------

    /// @notice Người thuê ký hợp đồng: gửi đúng tiền cọc + tiền thuê kỳ đầu. Hợp đồng bắt đầu tính từ lúc ký.
    function signLease(uint256 leaseId) external payable exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Pending, "Hop dong khong o trang thai cho ky");
        require(msg.sender == l.tenant, "Chi nguoi thue duoc ky hop dong");
        require(msg.value == l.deposit + l.rent, "Phai gui dung tien coc + tien thue ky dau");

        l.status = Status.Active;
        l.startDate = uint64(block.timestamp);
        l.paidPeriods = 1;
        balances[l.landlord] += l.rent; // tiền cọc ở lại contract, tiền thuê kỳ đầu về chủ nhà

        if (l.deposit > 0) _record(l.tenant, TxType.DepositPaid, leaseId, l.landlord, l.deposit);
        _record(l.tenant, TxType.RentPaid, leaseId, l.landlord, l.rent);
        _record(l.landlord, TxType.RentReceived, leaseId, l.tenant, l.rent);
        emit LeaseSigned(leaseId, l.tenant, l.startDate);
        emit RentPaid(leaseId, l.tenant, 1, l.rent, 1);
    }

    /// @notice Trả tiền thuê `periods` kỳ tiếp theo (trả bù kỳ còn nợ và/hoặc trả trước kỳ kế tiếp).
    /// @dev Chỉ được trả trước tối đa tới kỳ bắt đầu trong vòng 1 kỳ tới, để người thuê không bị kẹt
    ///      tiền trả trước nếu chấm dứt hợp đồng sớm.
    function payRent(uint256 leaseId, uint32 periods) external payable exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Active, "Hop dong khong hieu luc");
        require(msg.sender == l.tenant, "Chi nguoi thue duoc tra tien thue");
        require(periods > 0, "So ky phai lon hon 0");
        require(l.paidPeriods + periods <= l.totalPeriods, "Vuot qua so ky cua hop dong");
        require(msg.value == l.rent * periods, "So tien khong dung");
        // Kỳ cuối cùng được trả phải bắt đầu không muộn hơn 1 kỳ kể từ bây giờ
        require(
            l.startDate + uint256(l.paidPeriods + periods - 1) * l.periodLength <= block.timestamp + l.periodLength,
            "Chi duoc tra truoc toi da 1 ky"
        );

        l.paidPeriods += periods;
        balances[l.landlord] += msg.value;
        _record(l.tenant, TxType.RentPaid, leaseId, l.landlord, msg.value);
        _record(l.landlord, TxType.RentReceived, leaseId, l.tenant, msg.value);
        emit RentPaid(leaseId, l.tenant, periods, msg.value, l.paidPeriods);
    }

    // ---------------- Gia hạn (cần cả hai bên đồng ý) ----------------

    /// @notice Một bên đề xuất gia hạn thêm `periods` kỳ (cùng giá thuê). Bên còn lại chấp nhận thì có hiệu lực.
    function proposeExtension(uint256 leaseId, uint32 periods) external exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Active, "Hop dong khong hieu luc");
        require(msg.sender == l.landlord || msg.sender == l.tenant, "Ban khong thuoc hop dong nay");
        require(block.timestamp < endDate(leaseId), "Hop dong da het han");
        require(periods > 0 && l.totalPeriods + periods <= MAX_PERIODS, "So ky gia han khong hop le");
        l.extensionPeriods = periods;
        l.extensionBy = msg.sender;
        emit ExtensionProposed(leaseId, msg.sender, periods);
    }

    /// @notice Bên còn lại chấp nhận đề xuất gia hạn.
    function acceptExtension(uint256 leaseId) external exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Active, "Hop dong khong hieu luc");
        require(l.extensionPeriods > 0, "Khong co de xuat gia han");
        require(msg.sender == l.landlord || msg.sender == l.tenant, "Ban khong thuoc hop dong nay");
        require(msg.sender != l.extensionBy, "Ben con lai moi duoc chap nhan");
        require(block.timestamp < endDate(leaseId), "Hop dong da het han");
        uint32 periods = l.extensionPeriods;
        l.totalPeriods += periods;
        l.extensionPeriods = 0;
        l.extensionBy = address(0);
        emit LeaseExtended(leaseId, periods, l.totalPeriods);
    }

    /// @notice Rút lại (bên đề xuất) hoặc từ chối (bên kia) đề xuất gia hạn.
    function cancelExtension(uint256 leaseId) external exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.extensionPeriods > 0, "Khong co de xuat gia han");
        require(msg.sender == l.landlord || msg.sender == l.tenant, "Ban khong thuoc hop dong nay");
        l.extensionPeriods = 0;
        l.extensionBy = address(0);
        emit ExtensionCancelled(leaseId, msg.sender);
    }

    // ---------------- Kết thúc hợp đồng & xử lý tiền cọc ----------------

    /// @notice Chủ nhà kết thúc hợp đồng và quyết toán tiền cọc: khấu trừ `deduction` (kèm lý do), phần còn lại
    ///         hoàn cho người thuê. Chỉ gọi được khi hợp đồng đã hết hạn, hoặc người thuê nợ tiền quá 1 kỳ.
    function endLease(uint256 leaseId, uint256 deduction, string calldata note) external exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Active, "Hop dong khong hieu luc");
        require(msg.sender == l.landlord, "Chi chu nha duoc ket thuc hop dong");
        require(deduction <= l.deposit, "Khau tru vuot qua tien coc");
        require(deduction == 0 || bytes(note).length > 0, "Phai ghi ly do khau tru");
        require(bytes(note).length <= 200, "Ly do toi da 200 byte");

        string memory reason;
        if (block.timestamp >= endDate(leaseId)) {
            reason = "expired";
        } else {
            require(overduePeriods(leaseId) >= 2, "Hop dong chua het han va nguoi thue khong no qua 1 ky");
            reason = "non-payment";
        }
        _settle(leaseId, deduction, reason, note);
    }

    /// @notice Người thuê chấm dứt hợp đồng trước hạn: mất tiền cọc (chuyển cho chủ nhà).
    function terminateEarly(uint256 leaseId) external exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Active, "Hop dong khong hieu luc");
        require(msg.sender == l.tenant, "Chi nguoi thue duoc cham dut som");
        require(block.timestamp < endDate(leaseId), "Hop dong da het han, hay cho chu nha quyet toan");
        _settle(leaseId, l.deposit, "early-termination", "Nguoi thue cham dut hop dong truoc han");
    }

    /// @notice Hết hạn quá 1 kỳ mà chủ nhà chưa quyết toán: người thuê đã trả đủ tiền được tự nhận lại toàn bộ cọc.
    function claimDeposit(uint256 leaseId) external exists(leaseId) {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Active, "Hop dong khong hieu luc");
        require(msg.sender == l.tenant, "Chi nguoi thue duoc nhan lai coc");
        require(l.paidPeriods == l.totalPeriods, "Con no tien thue, khong the tu nhan coc");
        require(block.timestamp >= endDate(leaseId) + l.periodLength, "Chua qua thoi han quyet toan cua chu nha");
        _settle(leaseId, 0, "deposit-claimed", "");
    }

    // ---------------- Hoá đơn dịch vụ (điện, nước, phí khác) ----------------

    /// @notice Chủ nhà phát hành hoá đơn tháng: `rentPeriods` kỳ tiền phòng + `serviceAmount` tiền dịch vụ.
    function issueBill(uint256 leaseId, uint32 rentPeriods, uint256 serviceAmount, string calldata memo)
        external
        exists(leaseId)
        returns (uint256 billId)
    {
        Lease storage l = leases[leaseId];
        require(l.status == Status.Active, "Hop dong khong hieu luc");
        require(msg.sender == l.landlord, "Chi chu nha duoc phat hanh hoa don");
        require(l.paidPeriods + rentPeriods <= l.totalPeriods, "Vuot qua so ky cua hop dong");
        uint256 rentAmount = l.rent * rentPeriods;
        require(rentAmount + serviceAmount > 0, "So tien hoa don phai lon hon 0");
        require(bytes(memo).length > 0 && bytes(memo).length <= 200, "Noi dung hoa don dai 1-200 byte");

        billId = ++billCount;
        Bill storage b = bills[billId];
        b.leaseId = leaseId;
        b.rentPeriods = rentPeriods;
        b.rentAmount = rentAmount;
        b.amount = rentAmount + serviceAmount;
        b.memo = memo;
        b.issuedAt = uint64(block.timestamp);
        billIdsOf[leaseId].push(billId);
        emit BillIssued(billId, leaseId, b.amount, rentPeriods, memo);
    }

    /// @notice Người thuê trả đúng số tiền hoá đơn; tiền vào số dư của chủ nhà. Phần tiền phòng được cộng vào
    ///         số kỳ đã trả của hợp đồng. Hoá đơn chỉ có dịch vụ vẫn trả được sau khi hợp đồng kết thúc.
    function payBill(uint256 billId) external payable {
        require(billId > 0 && billId <= billCount, "Hoa don khong ton tai");
        Bill storage b = bills[billId];
        Lease storage l = leases[b.leaseId];
        require(msg.sender == l.tenant, "Chi nguoi thue duoc tra hoa don");
        require(!b.cancelled, "Hoa don da bi huy");
        require(!b.paid, "Hoa don da duoc thanh toan");
        require(msg.value == b.amount, "So tien khong dung");

        b.paid = true;
        b.paidAt = uint64(block.timestamp);
        balances[l.landlord] += msg.value;

        if (b.rentPeriods > 0) {
            require(l.status == Status.Active, "Hop dong khong hieu luc");
            require(l.paidPeriods + b.rentPeriods <= l.totalPeriods, "Vuot qua so ky cua hop dong");
            l.paidPeriods += b.rentPeriods;
            _record(l.tenant, TxType.RentPaid, b.leaseId, l.landlord, b.rentAmount);
            _record(l.landlord, TxType.RentReceived, b.leaseId, l.tenant, b.rentAmount);
            emit RentPaid(b.leaseId, l.tenant, b.rentPeriods, b.rentAmount, l.paidPeriods);
        }
        uint256 service = b.amount - b.rentAmount;
        if (service > 0) {
            _record(l.tenant, TxType.BillPaid, b.leaseId, l.landlord, service);
            _record(l.landlord, TxType.BillReceived, b.leaseId, l.tenant, service);
        }
        emit BillPaid(billId, b.leaseId, l.tenant, msg.value, b.rentAmount);
    }

    /// @notice Chủ nhà huỷ hoá đơn chưa thanh toán (vd. nhập sai chỉ số).
    function cancelBill(uint256 billId) external {
        require(billId > 0 && billId <= billCount, "Hoa don khong ton tai");
        Bill storage b = bills[billId];
        require(msg.sender == leases[b.leaseId].landlord, "Chi chu nha duoc huy hoa don");
        require(!b.paid, "Hoa don da duoc thanh toan");
        require(!b.cancelled, "Hoa don da bi huy");
        b.cancelled = true;
        emit BillCancelled(billId, b.leaseId);
    }

    function getBill(uint256 billId) external view returns (Bill memory) {
        require(billId > 0 && billId <= billCount, "Hoa don khong ton tai");
        return bills[billId];
    }

    function getBillIdsOf(uint256 leaseId) external view returns (uint256[] memory) {
        return billIdsOf[leaseId];
    }

    // ---------------- Ví ----------------

    /// @notice Rút số dư (tiền thuê đã nhận, tiền cọc được hoàn...) về ví.
    function withdraw(uint256 amount) external {
        require(amount > 0, "So tien rut phai lon hon 0");
        require(balances[msg.sender] >= amount, "So du khong du");
        balances[msg.sender] -= amount; // trừ trước khi chuyển để chống reentrancy
        _record(msg.sender, TxType.Withdraw, 0, address(0), amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Chuyen tien that bai");
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------- View ----------------

    function getLease(uint256 leaseId) external view exists(leaseId) returns (Lease memory) {
        return leases[leaseId];
    }

    /// @notice Danh sách hợp đồng [start, start + count) (id bắt đầu từ 1).
    function getLeases(uint256 start, uint256 count) external view returns (Lease[] memory list) {
        if (start == 0) start = 1;
        if (start > leaseCount || count == 0) return new Lease[](0);
        uint256 end = start + count - 1;
        if (end > leaseCount) end = leaseCount;
        list = new Lease[](end - start + 1);
        for (uint256 i = start; i <= end; i++) {
            list[i - start] = leases[i];
        }
    }

    /// @notice Id các hợp đồng mà `user` là chủ nhà hoặc người thuê.
    function getLeaseIdsOf(address user) external view returns (uint256[] memory) {
        return leaseIdsOf[user];
    }

    /// @notice Thời điểm hết hạn hợp đồng (0 nếu chưa ký).
    function endDate(uint256 leaseId) public view returns (uint256) {
        Lease storage l = leases[leaseId];
        if (l.startDate == 0) return 0;
        return l.startDate + uint256(l.totalPeriods) * l.periodLength;
    }

    /// @notice Tiền thuê đã trả tới thời điểm nào.
    function paidUntil(uint256 leaseId) public view returns (uint256) {
        Lease storage l = leases[leaseId];
        if (l.startDate == 0) return 0;
        return l.startDate + uint256(l.paidPeriods) * l.periodLength;
    }

    /// @notice Số kỳ đã đến hạn (tiền thuê trả đầu kỳ) mà chưa trả.
    function overduePeriods(uint256 leaseId) public view returns (uint256) {
        Lease storage l = leases[leaseId];
        if (l.status != Status.Active) return 0;
        uint256 due = (block.timestamp - l.startDate) / l.periodLength + 1;
        if (due > l.totalPeriods) due = l.totalPeriods;
        return due > l.paidPeriods ? due - l.paidPeriods : 0;
    }

    function getHistoryCount(address user) external view returns (uint256) {
        return histories[user].length;
    }

    /// @notice Lịch sử giao dịch [start, start + count) của một địa chỉ (cũ -> mới).
    function getHistory(address user, uint256 start, uint256 count) external view returns (Transaction[] memory list) {
        Transaction[] storage all = histories[user];
        if (start >= all.length) return new Transaction[](0);
        uint256 end = start + count;
        if (end > all.length) end = all.length;
        list = new Transaction[](end - start);
        for (uint256 i = start; i < end; i++) {
            list[i - start] = all[i];
        }
    }

    // ---------------- Nội bộ ----------------

    /// @dev Kết thúc hợp đồng: `deduction` của tiền cọc về chủ nhà, phần còn lại về người thuê.
    function _settle(uint256 leaseId, uint256 deduction, string memory reason, string memory note) private {
        Lease storage l = leases[leaseId];
        l.status = Status.Ended;
        l.depositDeducted = deduction;
        l.endNote = note;
        l.extensionPeriods = 0;
        l.extensionBy = address(0);

        uint256 refund = l.deposit - deduction;
        if (refund > 0) {
            balances[l.tenant] += refund;
            _record(l.tenant, TxType.DepositRefunded, leaseId, l.landlord, refund);
        }
        if (deduction > 0) {
            balances[l.landlord] += deduction;
            _record(l.landlord, TxType.DepositReceived, leaseId, l.tenant, deduction);
        }
        emit LeaseEnded(leaseId, refund, deduction, reason, note);
    }

    function _record(address user, TxType txType, uint256 leaseId, address counterparty, uint256 amount) private {
        histories[user].push(Transaction(txType, leaseId, counterparty, amount, uint64(block.timestamp)));
    }
}
