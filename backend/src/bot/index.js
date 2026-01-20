const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
require('dotenv').config();

// Инициализация
const bot = new Telegraf(process.env.BOT_TOKEN);
const adminIds = process.env.ADMIN_IDS.split(',').map(id => id.trim());

// Подключение к базе данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Создаем таблицы при запуске
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        verification_code VARCHAR(6),
        code_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        code VARCHAR(6) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used BOOLEAN DEFAULT FALSE
      );
    `);
    console.log('✅ Database tables created/verified');
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

// Генерация кода
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Очистка старых кодов
setInterval(async () => {
  try {
    await pool.query(
      "DELETE FROM verification_codes WHERE created_at < NOW() - INTERVAL '10 minutes'"
    );
  } catch (error) {
    console.error('Error cleaning old codes:', error);
  }
}, 60000); // Каждую минуту

// Команда /start
bot.start(async (ctx) => {
  await ctx.reply(
    '👋 Добро пожаловать в Lap Video Chat!\n\n' +
    'Для регистрации нажмите кнопку ниже, чтобы поделиться номером телефона.',
    Markup.keyboard([
      [Markup.button.contactRequest('📱 Поделиться номером')]
    ]).oneTime().resize()
  );
});

// Обработка контакта
bot.on('contact', async (ctx) => {
  const phone = ctx.message.contact.phone_number;
  const userId = ctx.from.id;
  
  // Убираем + если есть
  const cleanPhone = phone.startsWith('+') ? phone.substring(1) : phone;
  
  // Генерируем код
  const code = generateCode();
  
  try {
    // Сохраняем код в базу
    await pool.query(
      'INSERT INTO verification_codes (phone, code) VALUES ($1, $2)',
      [cleanPhone, code]
    );
    
    // Отправляем код пользователю
    await ctx.reply(
      `✅ Ваш код для регистрации: \n\n` +
      `🔢 **${code}**\n\n` +
      `⏳ Код действителен 10 минут.\n` +
      `Вернитесь в приложение и введите этот код.`,
      { parse_mode: 'Markdown' }
    );
    
    // Уведомляем админов
    for (const adminId of adminIds) {
      try {
        await bot.telegram.sendMessage(
          adminId,
          `📱 Новая регистрация:\n` +
          `Номер: ${cleanPhone}\n` +
          `Код: ${code}\n` +
          `ID: ${userId}\n` +
          `Время: ${new Date().toLocaleString()}`
        );
      } catch (error) {
        console.error(`Failed to notify admin ${adminId}:`, error);
      }
    }
    
  } catch (error) {
    console.error('Error saving code:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте еще раз.');
  }
});

// Команда для админов
bot.command('admin', async (ctx) => {
  if (!adminIds.includes(ctx.from.id.toString())) {
    return ctx.reply('⛔ У вас нет доступа к админ-панели.');
  }
  
  await ctx.reply(
    '👨‍💻 Админ-панель',
    Markup.inlineKeyboard([
      [Markup.button.callback('👥 Пользователи', 'admin_users')],
      [Markup.button.callback('🆘 Помощь запросы', 'admin_help')],
      [Markup.button.callback('🎵 Управление музыкой', 'admin_music')]
    ])
  );
});

// Запуск бота
async function startBot() {
  await initDB();
  
  bot.launch()
    .then(() => {
      console.log('🤖 Telegram bot started successfully');
      console.log(`Bot username: @${bot.botInfo.username}`);
    })
    .catch(err => {
      console.error('❌ Failed to start bot:', err);
      process.exit(1);
    });
  
  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

startBot();

module.exports = { bot, pool };
