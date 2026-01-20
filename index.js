require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { initDB, pool, generateCode, saveCode, verifyCode } = require('./src/bot/database');
const { handleStart, handleContact, handleHelp, setupAdminPanel } = require('./src/bot/handlers');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== НАСТРОЙКА БОТА ==========
const bot = new Telegraf(process.env.BOT_TOKEN);
const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];

// Инициализация базы данных при запуске
initDB().then(() => console.log('✅ База данных готова'));

// ========== ОБРАБОТЧИКИ КОМАНД ==========
bot.start(handleStart);
bot.on('contact', async (ctx) => {
  await handleContact(ctx, bot, adminIds, generateCode, saveCode);
});
bot.command('admin', (ctx) => setupAdminPanel(ctx, adminIds, pool));
bot.command('help', handleHelp);

// ========== ВЕБХУК ДЛЯ TELEGRAM ==========
// Используем секретный путь для вебхука
const webhookPath = `/webhook/${process.env.BOT_TOKEN}`;
app.use(express.json());
app.use(bot.webhookCallback(webhookPath));

// ========== HEALTH CHECK ДЛЯ "БУДИЛЬНИКА" ==========
app.get('/health', (req, res) => {
  res.json({ 
    status: 'alive', 
    service: 'Lap Video Chat Bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ========== API ДЛЯ ПРИЛОЖЕНИЯ ==========
// Проверка кода (из вашего мобильного приложения)
app.post('/api/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;
    
    if (!phone || !code) {
      return res.status(400).json({ success: false, message: 'Нужны номер и код' });
    }
    
    const isValid = await verifyCode(phone, code);
    
    if (isValid) {
      // Регистрируем пользователя
      await pool.query(
        'INSERT INTO users (phone, status) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET status = $2',
        [phone, 'active']
      );
      
      res.json({ success: true, message: 'Регистрация успешна!' });
    } else {
      res.status(400).json({ success: false, message: 'Неверный или просроченный код' });
    }
  } catch (error) {
    console.error('Ошибка верификации:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// ========== АДМИН API ==========
// Помощь пользователю (когда админ видит код в "помощи")
app.post('/admin/assist', async (req, res) => {
  try {
    const { admin_key, phone, code } = req.body;
    
    // Простейшая проверка админа (в продакшене нужен нормальный auth)
    if (admin_key !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ success: false, message: 'Доступ запрещен' });
    }
    
    const isValid = await verifyCode(phone, code);
    
    if (isValid) {
      await pool.query(
        'UPDATE users SET status = $1 WHERE phone = $2',
        ['active', phone]
      );
      
      res.json({ success: true, message: 'Пользователь активирован' });
    } else {
      res.status(400).json({ success: false, message: 'Код недействителен' });
    }
  } catch (error) {
    console.error('Ошибка админ-помощи:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// ========== ПИНГ САМИХ СЕБЯ (ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА) ==========
// Каждые 5 минут бот сам себя пингует
if (process.env.NODE_ENV === 'production') {
  const cron = require('node-cron');
  const axios = require('axios');
  
  cron.schedule('*/5 * * * *', async () => {
    try {
      const url = `https://${process.env.RENDER_SERVICE_NAME}.onrender.com/health`;
      await axios.get(url);
      console.log('✅ Самопинг выполнен:', new Date().toLocaleTimeString());
    } catch (error) {
      console.log('⚠️ Самопинг не удался:', error.message);
    }
  });
}

// ========== ЗАПУСК СЕРВЕРА ==========
app.listen(PORT, async () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  
  // Устанавливаем вебхук в Telegram
  if (process.env.NODE_ENV === 'production') {
    try {
      const webhookUrl = `https://${process.env.RENDER_SERVICE_NAME}.onrender.com${webhookPath}`;
      await bot.telegram.setWebhook(webhookUrl);
      console.log(`✅ Вебхук установлен: ${webhookUrl}`);
    } catch (error) {
      console.error('❌ Ошибка установки вебхука:', error);
    }
  } else {
    // В разработке используем локальный поллинг
    bot.launch();
    console.log('🤖 Бот запущен в режиме разработки (поллинг)');
  }
});

// Экспортируем для возможности ручной установки вебхука
module.exports = { 
  bot, 
  setWebhook: async () => {
    const webhookUrl = `https://${process.env.RENDER_SERVICE_NAME}.onrender.com${webhookPath}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Вебхук установлен: ${webhookUrl}`);
  }
};
