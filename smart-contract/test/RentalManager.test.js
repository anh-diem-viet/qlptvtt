const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const RENT = ethers.parseEther('0.3'); // tiền thuê mỗi kỳ
const DEPOSIT = ethers.parseEther('0.6'); // tiền cọc = 2 kỳ
const PERIOD = 30 * 24 * 60 * 60; // 30 ngày
const PERIODS = 6; // thuê 6 kỳ
const STATUS = { Pending: 0, Active: 1, Ended: 2, Cancelled: 3 };
const TX = { DepositPaid: 0, RentPaid: 1, RentReceived: 2, DepositRefunded: 3, DepositReceived: 4, Withdraw: 5, BillPaid: 6, BillReceived: 7 };

describe('RentalManager', () => {
  async function deployFixture() {
    const [owner, landlord, tenant, eve] = await ethers.getSigners();
    const rental = await ethers.deployContract('RentalManager');
    return { rental, owner, landlord, tenant, eve };
  }

  /** Chủ nhà tạo hợp đồng #1 cho người thuê (chưa ký). */
  async function createdFixture() {
    const ctx = await deployFixture();
    const { rental, landlord, tenant } = ctx;
    await rental.connect(landlord).createLease(tenant.address, 'Phòng 101 - 12 Trần Phú', RENT, DEPOSIT, PERIOD, PERIODS);
    return ctx;
  }

  /** Người thuê đã ký: đặt cọc + trả kỳ đầu. */
  async function activeFixture() {
    const ctx = await createdFixture();
    await ctx.rental.connect(ctx.tenant).signLease(1, { value: DEPOSIT + RENT });
    return ctx;
  }

  /** Trả đủ toàn bộ các kỳ còn lại (mỗi kỳ trả đúng hạn) rồi chờ hết hạn. */
  async function payAllAndExpire(rental, tenant) {
    for (let i = 1; i < PERIODS; i++) {
      await time.increase(PERIOD);
      await rental.connect(tenant).payRent(1, 1, { value: RENT });
    }
    await time.increase(PERIOD);
  }

  describe('Tạo hợp đồng', () => {
    it('chủ nhà tạo hợp đồng, phát sự kiện và lưu đúng thông tin', async () => {
      const { rental, landlord, tenant } = await loadFixture(deployFixture);
      await expect(rental.connect(landlord).createLease(tenant.address, 'Phòng 101', RENT, DEPOSIT, PERIOD, PERIODS))
        .to.emit(rental, 'LeaseCreated')
        .withArgs(1, landlord.address, tenant.address, RENT, DEPOSIT, PERIODS);
      const l = await rental.getLease(1);
      expect(l.landlord).to.equal(landlord.address);
      expect(l.tenant).to.equal(tenant.address);
      expect(l.roomName).to.equal('Phòng 101');
      expect(l.status).to.equal(STATUS.Pending);
      expect(await rental.getLeaseIdsOf(landlord.address)).to.deep.equal([1n]);
      expect(await rental.getLeaseIdsOf(tenant.address)).to.deep.equal([1n]);
    });

    it('chặn dữ liệu không hợp lệ', async () => {
      const { rental, landlord, tenant } = await loadFixture(deployFixture);
      const c = rental.connect(landlord);
      await expect(c.createLease(ethers.ZeroAddress, 'P', RENT, DEPOSIT, PERIOD, 1)).to.be.revertedWith('Dia chi nguoi thue khong hop le');
      await expect(c.createLease(landlord.address, 'P', RENT, DEPOSIT, PERIOD, 1)).to.be.revertedWith('Chu nha khong the tu thue phong cua minh');
      await expect(c.createLease(tenant.address, '', RENT, DEPOSIT, PERIOD, 1)).to.be.revertedWith('Ten phong dai 1-100 byte');
      await expect(c.createLease(tenant.address, 'P', 0, DEPOSIT, PERIOD, 1)).to.be.revertedWith('Tien thue phai lon hon 0');
      await expect(c.createLease(tenant.address, 'P', RENT, DEPOSIT, 10, 1)).to.be.revertedWith('Do dai ky khong hop le');
      await expect(c.createLease(tenant.address, 'P', RENT, DEPOSIT, PERIOD, 0)).to.be.revertedWith('So ky thue khong hop le');
      await expect(c.createLease(tenant.address, 'P', RENT, DEPOSIT, PERIOD, 241)).to.be.revertedWith('So ky thue khong hop le');
    });

    it('huỷ hợp đồng chưa ký: chủ nhà hoặc người thuê, người ngoài bị chặn', async () => {
      const { rental, landlord, tenant, eve } = await loadFixture(createdFixture);
      await expect(rental.connect(eve).cancelLease(1)).to.be.revertedWith('Ban khong thuoc hop dong nay');
      await expect(rental.connect(tenant).cancelLease(1)).to.emit(rental, 'LeaseCancelled').withArgs(1, tenant.address);
      expect((await rental.getLease(1)).status).to.equal(STATUS.Cancelled);
      await expect(rental.connect(tenant).signLease(1, { value: DEPOSIT + RENT })).to.be.revertedWith(
        'Hop dong khong o trang thai cho ky',
      );
      await expect(rental.connect(landlord).cancelLease(1)).to.be.revertedWith('Chi huy duoc hop dong chua ky');
    });
  });

  describe('Ký hợp đồng & trả tiền thuê', () => {
    it('ký hợp đồng: khoá tiền cọc trong contract, tiền thuê kỳ đầu về chủ nhà', async () => {
      const { rental, landlord, tenant } = await loadFixture(createdFixture);
      const tx = rental.connect(tenant).signLease(1, { value: DEPOSIT + RENT });
      await expect(tx).to.emit(rental, 'LeaseSigned');
      await expect(tx).to.emit(rental, 'RentPaid').withArgs(1, tenant.address, 1, RENT, 1);
      await expect(tx).to.changeEtherBalances([tenant, rental], [-(DEPOSIT + RENT), DEPOSIT + RENT]);

      const l = await rental.getLease(1);
      expect(l.status).to.equal(STATUS.Active);
      expect(l.paidPeriods).to.equal(1);
      expect(await rental.balances(landlord.address)).to.equal(RENT);
      expect(await rental.endDate(1)).to.equal(l.startDate + BigInt(PERIOD * PERIODS));
      expect(await rental.paidUntil(1)).to.equal(l.startDate + BigInt(PERIOD));
    });

    it('chỉ người thuê được ký và phải gửi đúng tiền cọc + kỳ đầu', async () => {
      const { rental, landlord, tenant, eve } = await loadFixture(createdFixture);
      await expect(rental.connect(eve).signLease(1, { value: DEPOSIT + RENT })).to.be.revertedWith(
        'Chi nguoi thue duoc ky hop dong',
      );
      await expect(rental.connect(landlord).signLease(1, { value: DEPOSIT + RENT })).to.be.revertedWith(
        'Chi nguoi thue duoc ky hop dong',
      );
      await expect(rental.connect(tenant).signLease(1, { value: RENT })).to.be.revertedWith(
        'Phai gui dung tien coc + tien thue ky dau',
      );
      await expect(rental.connect(tenant).signLease(99, { value: RENT })).to.be.revertedWith('Hop dong khong ton tai');
    });

    it('trả tiền thuê kỳ tiếp theo và trả bù nhiều kỳ còn nợ', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      // Trả trước kỳ 2 ngay (được phép trả trước 1 kỳ)
      await expect(rental.connect(tenant).payRent(1, 1, { value: RENT }))
        .to.emit(rental, 'RentPaid')
        .withArgs(1, tenant.address, 1, RENT, 2);

      // 3 kỳ sau: kỳ 3, 4 đã đến hạn mà chưa trả
      await time.increase(PERIOD * 3);
      expect(await rental.overduePeriods(1)).to.equal(2);
      await rental.connect(tenant).payRent(1, 2, { value: RENT * 2n });
      expect(await rental.overduePeriods(1)).to.equal(0);
      expect((await rental.getLease(1)).paidPeriods).to.equal(4);
      expect(await rental.balances(landlord.address)).to.equal(RENT * 4n);
    });

    it('chặn trả sai số tiền, trả trước quá 1 kỳ và vượt số kỳ hợp đồng', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      await expect(rental.connect(tenant).payRent(1, 1, { value: RENT - 1n })).to.be.revertedWith('So tien khong dung');
      await expect(rental.connect(tenant).payRent(1, 2, { value: RENT * 2n })).to.be.revertedWith(
        'Chi duoc tra truoc toi da 1 ky',
      );
      await expect(rental.connect(tenant).payRent(1, PERIODS, { value: RENT * BigInt(PERIODS) })).to.be.revertedWith(
        'Vuot qua so ky cua hop dong',
      );
      await expect(rental.connect(landlord).payRent(1, 1, { value: RENT })).to.be.revertedWith(
        'Chi nguoi thue duoc tra tien thue',
      );
      await expect(rental.connect(tenant).payRent(1, 0, { value: 0 })).to.be.revertedWith('So ky phai lon hon 0');
    });
  });

  describe('Gia hạn', () => {
    it('một bên đề xuất, bên kia chấp nhận thì tăng số kỳ', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      const endBefore = await rental.endDate(1);
      await expect(rental.connect(tenant).proposeExtension(1, 3))
        .to.emit(rental, 'ExtensionProposed')
        .withArgs(1, tenant.address, 3);
      await expect(rental.connect(tenant).acceptExtension(1)).to.be.revertedWith('Ben con lai moi duoc chap nhan');
      await expect(rental.connect(landlord).acceptExtension(1))
        .to.emit(rental, 'LeaseExtended')
        .withArgs(1, 3, PERIODS + 3);
      expect(await rental.endDate(1)).to.equal(endBefore + BigInt(PERIOD * 3));
      const l = await rental.getLease(1);
      expect(l.extensionPeriods).to.equal(0);
      expect(l.extensionBy).to.equal(ethers.ZeroAddress);
    });

    it('từ chối / rút lại đề xuất; người ngoài không đề xuất được; hết hạn thì không gia hạn', async () => {
      const { rental, landlord, tenant, eve } = await loadFixture(activeFixture);
      await expect(rental.connect(eve).proposeExtension(1, 1)).to.be.revertedWith('Ban khong thuoc hop dong nay');
      await rental.connect(landlord).proposeExtension(1, 2);
      await expect(rental.connect(tenant).cancelExtension(1)).to.emit(rental, 'ExtensionCancelled');
      await expect(rental.connect(tenant).acceptExtension(1)).to.be.revertedWith('Khong co de xuat gia han');
      await expect(rental.connect(landlord).proposeExtension(1, 300)).to.be.revertedWith('So ky gia han khong hop le');

      await time.increase(PERIOD * PERIODS);
      await expect(rental.connect(landlord).proposeExtension(1, 1)).to.be.revertedWith('Hop dong da het han');
    });

    it('sau gia hạn người thuê trả tiếp được các kỳ mới', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      await rental.connect(landlord).proposeExtension(1, 1);
      await rental.connect(tenant).acceptExtension(1);
      for (let i = 1; i < PERIODS + 1; i++) {
        await time.increase(PERIOD);
        await rental.connect(tenant).payRent(1, 1, { value: RENT });
      }
      expect((await rental.getLease(1)).paidPeriods).to.equal(PERIODS + 1);
    });
  });

  describe('Kết thúc hợp đồng & tiền cọc', () => {
    it('hết hạn: chủ nhà khấu trừ một phần cọc kèm lý do, phần còn lại hoàn cho người thuê', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      await payAllAndExpire(rental, tenant);
      const deduction = ethers.parseEther('0.1');
      await expect(rental.connect(landlord).endLease(1, deduction, 'Hỏng khoá cửa'))
        .to.emit(rental, 'LeaseEnded')
        .withArgs(1, DEPOSIT - deduction, deduction, 'expired', 'Hỏng khoá cửa');

      const l = await rental.getLease(1);
      expect(l.status).to.equal(STATUS.Ended);
      expect(l.depositDeducted).to.equal(deduction);
      expect(l.endNote).to.equal('Hỏng khoá cửa');
      expect(await rental.balances(tenant.address)).to.equal(DEPOSIT - deduction);
      expect(await rental.balances(landlord.address)).to.equal(RENT * BigInt(PERIODS) + deduction);
    });

    it('chặn kết thúc sớm khi người thuê không nợ, khấu trừ quá cọc hoặc không ghi lý do', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      await expect(rental.connect(landlord).endLease(1, 0, '')).to.be.revertedWith(
        'Hop dong chua het han va nguoi thue khong no qua 1 ky',
      );
      await expect(rental.connect(tenant).endLease(1, 0, '')).to.be.revertedWith('Chi chu nha duoc ket thuc hop dong');
      await payAllAndExpire(rental, tenant);
      await expect(rental.connect(landlord).endLease(1, DEPOSIT + 1n, 'x')).to.be.revertedWith('Khau tru vuot qua tien coc');
      await expect(rental.connect(landlord).endLease(1, 1n, '')).to.be.revertedWith('Phai ghi ly do khau tru');
    });

    it('người thuê nợ quá 1 kỳ: chủ nhà được chấm dứt và trừ cọc', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      await time.increase(PERIOD); // kỳ 2 đến hạn, mới nợ 1 kỳ
      expect(await rental.overduePeriods(1)).to.equal(1);
      await expect(rental.connect(landlord).endLease(1, RENT, 'Nợ tiền nhà')).to.be.revertedWith(
        'Hop dong chua het han va nguoi thue khong no qua 1 ky',
      );
      await time.increase(PERIOD); // kỳ 3 đến hạn: nợ 2 kỳ
      expect(await rental.overduePeriods(1)).to.equal(2);
      await expect(rental.connect(landlord).endLease(1, RENT * 2n, 'Nợ 2 kỳ tiền nhà'))
        .to.emit(rental, 'LeaseEnded')
        .withArgs(1, DEPOSIT - RENT * 2n, RENT * 2n, 'non-payment', 'Nợ 2 kỳ tiền nhà');
    });

    it('người thuê chấm dứt sớm thì mất cọc', async () => {
      const { rental, landlord, tenant, eve } = await loadFixture(activeFixture);
      await expect(rental.connect(eve).terminateEarly(1)).to.be.revertedWith('Chi nguoi thue duoc cham dut som');
      await expect(rental.connect(tenant).terminateEarly(1))
        .to.emit(rental, 'LeaseEnded')
        .withArgs(1, 0, DEPOSIT, 'early-termination', 'Nguoi thue cham dut hop dong truoc han');
      expect(await rental.balances(landlord.address)).to.equal(RENT + DEPOSIT);
      expect(await rental.balances(tenant.address)).to.equal(0);
      await expect(rental.connect(tenant).payRent(1, 1, { value: RENT })).to.be.revertedWith('Hop dong khong hieu luc');
    });

    it('chủ nhà không quyết toán quá 1 kỳ sau hạn: người thuê tự nhận lại toàn bộ cọc', async () => {
      const { rental, tenant } = await loadFixture(activeFixture);
      await payAllAndExpire(rental, tenant);
      await expect(rental.connect(tenant).claimDeposit(1)).to.be.revertedWith('Chua qua thoi han quyet toan cua chu nha');
      await time.increase(PERIOD);
      await expect(rental.connect(tenant).claimDeposit(1))
        .to.emit(rental, 'LeaseEnded')
        .withArgs(1, DEPOSIT, 0, 'deposit-claimed', '');
      expect(await rental.balances(tenant.address)).to.equal(DEPOSIT);
    });

    it('người thuê còn nợ thì không tự nhận cọc được', async () => {
      const { rental, tenant } = await loadFixture(activeFixture);
      await time.increase(PERIOD * (PERIODS + 1));
      await expect(rental.connect(tenant).claimDeposit(1)).to.be.revertedWith('Con no tien thue, khong the tu nhan coc');
    });
  });

  describe('Hoá đơn dịch vụ (điện, nước, phí khác)', () => {
    const BILL = ethers.parseEther('0.0558'); // vd. điện 95 số + nước 6 khối + rác/wifi
    const MEMO = 'HD1 2026-06 P101: dien 95 so, nuoc 6 khoi';

    it('chủ nhà phát hành, người thuê trả đúng số tiền, tiền vào số dư chủ nhà', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      await expect(rental.connect(landlord).issueBill(1, 0, BILL, MEMO))
        .to.emit(rental, 'BillIssued')
        .withArgs(1, 1, BILL, 0, MEMO);
      await expect(rental.connect(tenant).payBill(1, { value: BILL - 1n })).to.be.revertedWith('So tien khong dung');
      await expect(rental.connect(tenant).payBill(1, { value: BILL }))
        .to.emit(rental, 'BillPaid')
        .withArgs(1, 1, tenant.address, BILL, 0);
      const b = await rental.getBill(1);
      expect(b.paid).to.equal(true);
      expect(b.memo).to.equal(MEMO);
      expect(await rental.balances(landlord.address)).to.equal(RENT + BILL);
      expect(await rental.getBillIdsOf(1)).to.deep.equal([1n]);
      await expect(rental.connect(tenant).payBill(1, { value: BILL })).to.be.revertedWith('Hoa don da duoc thanh toan');

      const hist = await rental.getHistory(tenant.address, 0, 10);
      expect(Number(hist[hist.length - 1].txType)).to.equal(TX.BillPaid);
    });

    it('chỉ chủ nhà phát hành / huỷ; người ngoài không trả thay; hoá đơn huỷ thì không trả được', async () => {
      const { rental, landlord, tenant, eve } = await loadFixture(activeFixture);
      await expect(rental.connect(tenant).issueBill(1, 0, BILL, MEMO)).to.be.revertedWith('Chi chu nha duoc phat hanh hoa don');
      await expect(rental.connect(landlord).issueBill(1, 0, 0, MEMO)).to.be.revertedWith('So tien hoa don phai lon hon 0');
      await expect(rental.connect(landlord).issueBill(1, 0, BILL, '')).to.be.revertedWith('Noi dung hoa don dai 1-200 byte');
      await rental.connect(landlord).issueBill(1, 0, BILL, MEMO);
      await expect(rental.connect(eve).payBill(1, { value: BILL })).to.be.revertedWith('Chi nguoi thue duoc tra hoa don');
      await expect(rental.connect(tenant).cancelBill(1)).to.be.revertedWith('Chi chu nha duoc huy hoa don');
      await expect(rental.connect(landlord).cancelBill(1)).to.emit(rental, 'BillCancelled').withArgs(1, 1);
      await expect(rental.connect(tenant).payBill(1, { value: BILL })).to.be.revertedWith('Hoa don da bi huy');
      await expect(rental.connect(tenant).payBill(9, { value: BILL })).to.be.revertedWith('Hoa don khong ton tai');
    });

    it('hoá đơn gồm tiền phòng: trả hoá đơn thì cộng số kỳ đã trả của hợp đồng', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      await expect(rental.connect(landlord).issueBill(1, 1, BILL, MEMO))
        .to.emit(rental, 'BillIssued')
        .withArgs(1, 1, RENT + BILL, 1, MEMO);
      const tx = rental.connect(tenant).payBill(1, { value: RENT + BILL });
      await expect(tx).to.emit(rental, 'RentPaid').withArgs(1, tenant.address, 1, RENT, 2);
      await expect(tx).to.emit(rental, 'BillPaid').withArgs(1, 1, tenant.address, RENT + BILL, RENT);
      expect((await rental.getLease(1)).paidPeriods).to.equal(2);
      const hist = await rental.getHistory(tenant.address, 0, 10);
      expect(hist.map((h) => Number(h.txType))).to.deep.equal([TX.DepositPaid, TX.RentPaid, TX.RentPaid, TX.BillPaid]);
      // Không phát hành vượt số kỳ còn lại của hợp đồng
      await expect(rental.connect(landlord).issueBill(1, PERIODS, 0, MEMO)).to.be.revertedWith('Vuot qua so ky cua hop dong');
    });

    it('hợp đồng chưa ký không phát hành được; hoá đơn cũ vẫn trả được sau khi kết thúc', async () => {
      const { rental, landlord, tenant } = await loadFixture(createdFixture);
      await expect(rental.connect(landlord).issueBill(1, 0, BILL, MEMO)).to.be.revertedWith('Hop dong khong hieu luc');
      await rental.connect(tenant).signLease(1, { value: DEPOSIT + RENT });
      await rental.connect(landlord).issueBill(1, 0, BILL, MEMO);
      await rental.connect(tenant).terminateEarly(1);
      await expect(rental.connect(tenant).payBill(1, { value: BILL })).to.emit(rental, 'BillPaid');
    });
  });

  describe('Rút tiền & lịch sử giao dịch', () => {
    it('chủ nhà rút tiền thuê, không rút quá số dư', async () => {
      const { rental, landlord } = await loadFixture(activeFixture);
      await expect(rental.connect(landlord).withdraw(RENT)).to.changeEtherBalance(landlord, RENT);
      expect(await rental.balances(landlord.address)).to.equal(0);
      await expect(rental.connect(landlord).withdraw(1)).to.be.revertedWith('So du khong du');
      await expect(rental.connect(landlord).withdraw(0)).to.be.revertedWith('So tien rut phai lon hon 0');
    });

    it('ghi lịch sử giao dịch cho cả hai bên, có phân trang', async () => {
      const { rental, landlord, tenant } = await loadFixture(activeFixture);
      await rental.connect(tenant).payRent(1, 1, { value: RENT });
      await rental.connect(landlord).withdraw(RENT);

      expect(await rental.getHistoryCount(tenant.address)).to.equal(3);
      const t = await rental.getHistory(tenant.address, 0, 10);
      expect(t.map((x) => Number(x.txType))).to.deep.equal([TX.DepositPaid, TX.RentPaid, TX.RentPaid]);
      expect(t[0].amount).to.equal(DEPOSIT);
      expect(t[1].counterparty).to.equal(landlord.address);
      expect(t[1].leaseId).to.equal(1);

      const l = await rental.getHistory(landlord.address, 0, 10);
      expect(l.map((x) => Number(x.txType))).to.deep.equal([TX.RentReceived, TX.RentReceived, TX.Withdraw]);
      expect(await rental.getHistory(landlord.address, 2, 10)).to.have.length(1);
      expect(await rental.getHistory(landlord.address, 5, 10)).to.have.length(0);
    });

    it('danh sách hợp đồng phân trang', async () => {
      const { rental, landlord, tenant, eve } = await loadFixture(createdFixture);
      await rental.connect(landlord).createLease(eve.address, 'Phòng 102', RENT, 0, PERIOD, 3);
      await rental.connect(landlord).createLease(tenant.address, 'Phòng 103', RENT, 0, PERIOD, 3);
      expect(await rental.leaseCount()).to.equal(3);
      const list = await rental.getLeases(2, 10);
      expect(list.map((l) => l.roomName)).to.deep.equal(['Phòng 102', 'Phòng 103']);
      expect(await rental.getLeases(4, 10)).to.have.length(0);
      expect(await rental.getLeaseIdsOf(tenant.address)).to.deep.equal([1n, 3n]);
    });

    it('hợp đồng không cọc: ký chỉ cần trả kỳ đầu, kết thúc không hoàn gì', async () => {
      const { rental, landlord, tenant } = await loadFixture(deployFixture);
      await rental.connect(landlord).createLease(tenant.address, 'Phòng 201', RENT, 0, PERIOD, 1);
      await rental.connect(tenant).signLease(1, { value: RENT });
      await time.increase(PERIOD);
      await expect(rental.connect(landlord).endLease(1, 0, ''))
        .to.emit(rental, 'LeaseEnded')
        .withArgs(1, 0, 0, 'expired', '');
      expect(await rental.getHistoryCount(tenant.address)).to.equal(1);
    });
  });
});
