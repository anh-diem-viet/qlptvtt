require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb, DB_NAME, dbConfig } = require('./db');
const auth = require('./auth');
const leases = require('./leases');
const manage = require('./manage');
const { startIndexer } = require('./indexer');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend đang chạy', time: new Date().toISOString() });
});

// Callback Google giữ đúng đường dẫn đã đăng ký trong GOOGLE_CALLBACK_URL (không có /api)
app.get('/auth/google/callback', auth.googleCallback);
app.use('/api', auth.router);
app.use('/api', leases.router);
// Quản lý nhà trọ (bắt buộc đăng nhập) — đặt sau cùng vì router này yêu cầu token cho mọi đường dẫn còn lại
app.use('/api', manage.router);

app.use((req, res) => {
  res.status(404).json({ message: 'Không tìm thấy' });
});

// Express 5 tự chuyển lỗi của handler async tới đây
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Lỗi máy chủ' });
});

async function main() {
  try {
    await initDb();
  } catch (err) {
    console.error(
      `Không kết nối được MySQL tại ${dbConfig.user}@${dbConfig.host}:${dbConfig.port} — ${err.code || err.message}\n` +
        'Kiểm tra MySQL đã chạy chưa (cd backend && docker compose up -d) và DB_USER / DB_PASSWORD trong backend/.env.',
    );
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
    console.log(`Database: MySQL ${dbConfig.host}:${dbConfig.port}/${DB_NAME}`);
    startIndexer();
    manage.startScheduler();
  });
}

main();
