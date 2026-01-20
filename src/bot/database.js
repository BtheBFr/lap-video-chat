const { Pool } = require('pg');

// Подключение к БД
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Инициализация таблиц
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        username VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        code VARCHAR(6) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used BOOLEAN DEFAULT FALSE,
        CONSTRAINT unique_active_code UNIQUE(phone, code) WHERE NOT used
      );
      
      CREATE INDEX IF NOT EXISTS idx_codes_phone ON verification_codes(phone);
      CREATE INDEX IF NOT EXISTS idx_codes_created ON verification_codes(created_at);
    `);
    
    // Очистка старых кодов каждые 10 минут
    await pool.query(
      "DELETE FROM verification_codes WHERE created_at < NOW() - INTERVAL '10 minutes'"
    );
    
    console.log('✅ База данных инициализирована');
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
  }
};

// Генерация 6-значного кода
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Сохранение кода в БД
const saveCode = async (phone, code) => {
  try {
    await pool.query(
      'INSERT INTO verification_codes (phone, code) VALUES ($1, $2)',
      [phone, code]
    );
    return true;
  } catch (error) {
    console.error('Ошибка сохранения кода:', error);
    return false;
  }
};

// Проверка кода
const verifyCode = async (phone, code) => {
  try {
    const result = await pool.query(
      `SELECT * FROM verification_codes 
       WHERE phone = $1 AND code = $2 
       AND created_at > NOW() - INTERVAL '10 minutes'
       AND used = FALSE
       LIMIT 1`,
      [phone, code]
    );
    
    if (result.rows.length > 0) {
      // Помечаем как использованный
      await pool.query(
        'UPDATE verification_codes SET used = TRUE WHERE id = $1',
        [result.rows[0].id]
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error('Ошибка проверки кода:', error);
    return false;
  }
};

module.exports = { pool, initDB, generateCode, saveCode, verifyCode };
