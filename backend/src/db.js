const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3308),
  user: process.env.DB_USER || 'nhatro',
  password: process.env.DB_PASSWORD || 'nhatro',
};
const DB_NAME = process.env.DB_NAME || 'nha_tro';

let pool = null;

const SCHEMA = [
  // Tài khoản = tài khoản Google; ví MetaMask được liên kết bằng chữ ký
  `CREATE TABLE IF NOT EXISTS users (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    google_id      VARCHAR(64)   NOT NULL UNIQUE,         -- "sub" trong ID token của Google
    email          VARCHAR(255)  NOT NULL,
    name           VARCHAR(255)  NOT NULL,
    avatar_url     VARCHAR(1024) NULL,
    nickname       VARCHAR(20)   NULL UNIQUE,             -- collation _ci: không phân biệt hoa thường
    wallet_address CHAR(42)      NULL UNIQUE,             -- ví đã liên kết (chữ thường)
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at  DATETIME      NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token      CHAR(64)     NOT NULL PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    expires_at BIGINT       NOT NULL,                     -- unix ms
    INDEX idx_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // Sự kiện của hợp đồng thuê, đồng bộ từ blockchain (nhật ký hợp đồng + thống kê thu/chi).
  // Chỉ backend ghi bảng này từ log của contract, client không gửi dữ liệu vào được.
  `CREATE TABLE IF NOT EXISTS lease_events (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    lease_id     INT UNSIGNED    NOT NULL,
    event_name   VARCHAR(32)     NOT NULL,                -- LeaseCreated, RentPaid, LeaseEnded…
    landlord     CHAR(42)        NOT NULL,                -- chữ thường
    tenant       CHAR(42)        NOT NULL,
    actor        CHAR(42)        NULL,                    -- bên thực hiện (nếu sự kiện có)
    amount_wei   DECIMAL(65, 0)  NOT NULL DEFAULT 0,      -- số tiền chính của sự kiện
    data         JSON            NOT NULL,                -- toàn bộ tham số sự kiện (số dạng chuỗi)
    block_number BIGINT          NOT NULL,
    tx_hash      CHAR(66)        NOT NULL,
    log_index    INT UNSIGNED    NOT NULL,
    block_time   BIGINT          NOT NULL,                -- unix giây (timestamp của block)
    bill_id      INT UNSIGNED    NULL,                    -- với sự kiện BillIssued / BillPaid / BillCancelled
    UNIQUE KEY uq_lease_events_log (tx_hash, log_index),
    INDEX idx_lease_events_lease (lease_id),
    INDEX idx_lease_events_landlord (landlord),
    INDEX idx_lease_events_tenant (tenant),
    INDEX idx_lease_events_bill (bill_id)
  )`,
  // ================= Quản lý nhà trọ — 8 bảng theo ERD =================
  // (1) PHONGTRO — Phòng. Trạng thái (Trống / Chờ ký / Đã thuê) suy ra từ hợp đồng hiện tại trên blockchain.
  `CREATE TABLE IF NOT EXISTS rooms (
    id          INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,   -- MaPhong
    owner_id    INT UNSIGNED   NOT NULL,                              -- chủ nhà (users.id)
    code        VARCHAR(20)    NOT NULL,                              -- P101, P102, P201… (theo tầng)
    name        VARCHAR(100)   NOT NULL,                              -- TenPhong
    floor       TINYINT        NOT NULL,                              -- Tang
    area        DECIMAL(6, 1)  NOT NULL,                              -- DienTich (m²)
    price_wei   DECIMAL(65, 0) NOT NULL,                              -- GiaThue / kỳ
    deposit_wei DECIMAL(65, 0) NOT NULL DEFAULT 0,                    -- tiền cọc đề xuất
    lease_id    INT UNSIGNED   NULL,                                  -- hợp đồng hiện tại (leases.lease_id)
    note        VARCHAR(255)   NULL,
    created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_rooms_code (owner_id, code),
    CONSTRAINT fk_rooms_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // (2) KHACHHANG — Khách thuê: hồ sơ pháp lý, dữ liệu cá nhân chỉ lưu ở backend (không đưa lên blockchain)
  `CREATE TABLE IF NOT EXISTS tenants (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY, -- MaKH
    owner_id       INT UNSIGNED  NOT NULL,
    code           VARCHAR(20)   NOT NULL,                            -- KH001, KH002…
    full_name      VARCHAR(100)  NOT NULL,                            -- HoTen
    id_number      VARCHAR(20)   NULL,                                -- CCCD
    phone          VARCHAR(20)   NULL,                                -- SoDienThoai
    email          VARCHAR(255)  NULL,
    hometown       VARCHAR(100)  NULL,                                -- QueQuan
    room_id        INT UNSIGNED  NULL,                                -- phòng đang ở
    wallet_address CHAR(42)      NULL,                                -- ví MetaMask (để tạo hợp đồng)
    move_in_date   DATE          NULL,
    people_count   TINYINT       NOT NULL DEFAULT 1,
    id_photo_url   VARCHAR(1024) NULL,                                -- link ảnh CCCD
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tenants_code (owner_id, code),
    INDEX idx_tenants_room (room_id),
    CONSTRAINT fk_tenants_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_tenants_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  )`,
  // (3) HOPDONG — Hợp đồng thuê: bản sao của hợp đồng trên smart contract, đồng bộ từ blockchain
  `CREATE TABLE IF NOT EXISTS leases (
    lease_id       INT UNSIGNED   NOT NULL PRIMARY KEY,               -- MaHD = id hợp đồng trên contract
    owner_id       INT UNSIGNED   NOT NULL,
    room_id        INT UNSIGNED   NOT NULL,                           -- MaPhong (FK)
    tenant_id      INT UNSIGNED   NULL,                               -- MaKH (FK)
    tenant_address CHAR(42)       NOT NULL,
    rent_wei       DECIMAL(65, 0) NOT NULL,
    deposit_wei    DECIMAL(65, 0) NOT NULL,                           -- TienCoc
    period_length  INT UNSIGNED   NOT NULL,                           -- giây / kỳ
    total_periods  INT UNSIGNED   NOT NULL,
    paid_periods   INT UNSIGNED   NOT NULL DEFAULT 0,
    start_date     BIGINT         NULL,                               -- NgayBatDau (unix giây, giờ blockchain)
    end_date       BIGINT         NULL,                               -- NgayKetThuc
    status         ENUM('pending', 'active', 'ended', 'cancelled') NOT NULL DEFAULT 'pending',
    deposit_deducted_wei DECIMAL(65, 0) NOT NULL DEFAULT 0,
    updated_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_leases_room (room_id),
    CONSTRAINT fk_leases_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_leases_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_leases_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
  )`,
  // (4) DICHVU — Dịch vụ kèm theo: Điện, Nước (tính theo chỉ số), Internet, Rác, Gửi xe (cố định / tháng)
  `CREATE TABLE IF NOT EXISTS services (
    id             INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY, -- MaDV
    owner_id       INT UNSIGNED   NOT NULL,
    name           VARCHAR(50)    NOT NULL,                            -- TenDV
    unit           VARCHAR(20)    NOT NULL,                            -- DonViTinh: kWh, m³, tháng, xe…
    unit_price_wei DECIMAL(65, 0) NOT NULL,                            -- DonGia
    kind           ENUM('metered', 'fixed') NOT NULL,                  -- theo chỉ số / cố định mỗi tháng
    active         TINYINT(1)     NOT NULL DEFAULT 1,
    UNIQUE KEY uq_services_name (owner_id, name),
    CONSTRAINT fk_services_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // (5) SUDUNGDV — Chỉ số dịch vụ hằng tháng (điện, nước): chỉ số cũ / mới của từng phòng
  `CREATE TABLE IF NOT EXISTS service_usage (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_id    INT UNSIGNED NOT NULL,                                  -- MaPhong (FK)
    service_id INT UNSIGNED NOT NULL,                                  -- MaDV (FK)
    month      CHAR(7)      NOT NULL,                                  -- ThangNam (YYYY-MM)
    old_index  INT UNSIGNED NOT NULL,                                  -- ChiSoCu
    new_index  INT UNSIGNED NOT NULL,                                  -- ChiSoMoi
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usage (room_id, service_id, month),
    CONSTRAINT fk_usage_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_usage_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
  )`,
  // (6) HOADON — Hoá đơn tháng: tiền phòng + tổng tiền dịch vụ; phát hành & thanh toán trên blockchain
  `CREATE TABLE IF NOT EXISTS invoices (
    id                INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY, -- MaHDn
    owner_id          INT UNSIGNED   NOT NULL,
    room_id           INT UNSIGNED   NOT NULL,                            -- MaPhong (FK)
    lease_id          INT UNSIGNED   NOT NULL,                            -- hợp đồng (FK)
    tenant_address    CHAR(42)       NOT NULL,
    month             CHAR(7)        NOT NULL,                            -- ThangNam
    rent_periods      INT UNSIGNED   NOT NULL,                            -- số kỳ tiền phòng trong hoá đơn
    rent_wei          DECIMAL(65, 0) NOT NULL,                            -- TienPhong
    service_total_wei DECIMAL(65, 0) NOT NULL,                            -- TongTienDichVu
    total_wei         DECIMAL(65, 0) NOT NULL,                            -- TongTien
    items             JSON           NOT NULL,                            -- chi tiết từng dịch vụ
    bill_id           INT UNSIGNED   NULL UNIQUE,                         -- id hoá đơn trên contract
    auto_created      TINYINT(1)     NOT NULL DEFAULT 0,
    created_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_invoices_room_month (room_id, month),
    INDEX idx_invoices_tenant (tenant_address),
    CONSTRAINT fk_invoices_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_invoices_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_invoices_lease FOREIGN KEY (lease_id) REFERENCES leases(lease_id) ON DELETE CASCADE
  )`,
  // (7) PHIEUTHANHTOAN — Phiếu thu: trên blockchain (tự ghi từ sự kiện BillPaid) hoặc tiền mặt / chuyển khoản
  `CREATE TABLE IF NOT EXISTS payments (
    id         INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,     -- MaPT
    invoice_id INT UNSIGNED   NOT NULL,                                -- MaHDn (FK)
    paid_at    DATETIME       NOT NULL,                                -- NgayThanhToan
    amount_wei DECIMAL(65, 0) NOT NULL,                                -- SoTienThu
    method     ENUM('blockchain', 'tien_mat', 'chuyen_khoan') NOT NULL, -- HinhThuc
    tx_hash    CHAR(66)       NULL,
    log_index  INT UNSIGNED   NULL,
    note       VARCHAR(255)   NULL,
    UNIQUE KEY uq_payments_log (tx_hash, log_index),
    CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  )`,
  // (8) THIETBI — Đồ dùng trong phòng (dùng khi bàn giao / quyết toán tiền cọc)
  `CREATE TABLE IF NOT EXISTS equipment (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,      -- MaTB
    room_id     INT UNSIGNED NOT NULL,                                 -- MaPhong (FK)
    name        VARCHAR(100) NOT NULL,                                 -- TenTB
    state       ENUM('tot', 'can_sua', 'hong') NOT NULL DEFAULT 'tot', -- TinhTrang
    note        VARCHAR(255) NULL,
    CONSTRAINT fk_equipment_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  )`,
  // ---------- Bảng phụ ----------
  // Khách tìm phòng -> xem phòng & thoả thuận: yêu cầu thuê gửi tới chủ nhà
  `CREATE TABLE IF NOT EXISTS room_requests (
    id         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_id    INT UNSIGNED  NOT NULL,
    user_id    INT UNSIGNED  NOT NULL,                                  -- người muốn thuê
    message    VARCHAR(500)  NULL,                                      -- lời nhắn: lịch xem phòng, số người ở…
    status     ENUM('pending', 'accepted', 'rejected', 'withdrawn') NOT NULL DEFAULT 'pending',
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_requests_room (room_id),
    INDEX idx_requests_user (user_id),
    CONSTRAINT fk_requests_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // Sổ thu chi: khoản nhập tay (chi sửa máy bơm, internet chung…). Khoản thu từ blockchain + phiếu thu tự cộng vào.
  `CREATE TABLE IF NOT EXISTS cash_entries (
    id         INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_id   INT UNSIGNED   NOT NULL,
    entry_date DATE           NOT NULL,
    type       ENUM('thu', 'chi') NOT NULL,
    category   VARCHAR(50)    NOT NULL,
    room_id    INT UNSIGNED   NULL,
    amount_wei DECIMAL(65, 0) NOT NULL,
    note       VARCHAR(255)   NULL,
    created_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cash_owner_date (owner_id, entry_date),
    CONSTRAINT fk_cash_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cash_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    meta_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
    meta_value VARCHAR(255) NULL
  )`,
];

/** Tạo database (nếu chưa có), pool kết nối và các bảng. Gọi một lần khi khởi động. */
async function initDb() {
  const conn = await mysql.createConnection(config);
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.end();

  pool = mysql.createPool({ ...config, database: DB_NAME, charset: 'utf8mb4', connectionLimit: 10 });
  // Bản thử nghiệm trước (settings / meter_readings kiểu cũ): bỏ các bảng quản lý để tạo lại theo ERD
  const [legacy] = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name IN ('settings', 'meter_readings')`,
    [DB_NAME],
  );
  if (legacy.length) {
    console.log('[db] Chuyển schema quản lý nhà trọ sang ERD 8 bảng');
    for (const t of ['payments', 'invoices', 'meter_readings', 'settings', 'equipment', 'service_usage', 'services', 'leases', 'room_requests', 'tenants', 'cash_entries', 'rooms']) {
      await pool.query(`DROP TABLE IF EXISTS ${t}`);
    }
  }

  for (const sql of SCHEMA) await pool.query(sql);

  // Database tạo từ bản trước chưa có cột bill_id
  const [cols] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'lease_events' AND column_name = 'bill_id'`,
    [DB_NAME],
  );
  if (!cols.length) {
    await pool.query(
      'ALTER TABLE lease_events ADD COLUMN bill_id INT UNSIGNED NULL, ADD INDEX idx_lease_events_bill (bill_id)',
    );
  }
}

/** Chạy câu lệnh có tham số, trả về rows (SELECT) hoặc kết quả (INSERT/UPDATE/DELETE). */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getMeta(key) {
  const rows = await query('SELECT meta_value FROM meta WHERE meta_key = ?', [key]);
  return rows[0]?.meta_value ?? null;
}

async function setMeta(key, value) {
  await query(
    'INSERT INTO meta (meta_key, meta_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)',
    [key, value == null ? null : String(value)],
  );
}

module.exports = { initDb, query, getMeta, setMeta, DB_NAME, dbConfig: config };
