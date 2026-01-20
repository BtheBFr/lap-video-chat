const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { pool } = require('../bot/index');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Lap Video Chat API' });
});

// Проверка кода
app.post('/api/verify-code', async (req, res) => {
  try {
    const { phone, code } = req.body;
    
    const result = await pool.query(
      `SELECT * FROM verification_codes 
       WHERE phone = $1 AND code = $2 
       AND created_at > NOW() - INTERVAL '10 minutes'
       AND used = FALSE`,
      [phone, code]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Неверный или просроченный код' 
      });
    }
    
    // Помечаем код как использованный
    await pool.query(
      'UPDATE verification_codes SET used = TRUE WHERE id = $1',
      [result.rows[0].id]
    );
    
    res.json({ success: true, message: 'Код подтвержден' });
    
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
});
