const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Ваш существующий код обработки команд
bot.start((ctx) => ctx.reply('Welcome'));
bot.on('text', (ctx) => ctx.reply('Message received'));

// Настройка вебхука
app.use(express.json());
app.use(bot.webhookCallback('/secret-path'));

// Health-check эндпоинт для «будильника»
app.get('/health', (req, res) => {
  res.json({ status: 'alive', timestamp: Date.now() });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot server listening on port ${PORT}`);
  // Устанавливаем вебхук после запуска
  bot.telegram.setWebhook(`https://your-app.onrender.com/secret-path`);
});
