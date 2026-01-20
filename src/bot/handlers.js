const { Markup } = require('telegraf');

// Обработчик /start
const handleStart = async (ctx) => {
  await ctx.reply(
    '👋 *Добро пожаловать в Lap Video Chat!*\n\n' +
    'Это приложение только для видеозвонков от *Lap.comp* при поддержке *B the B*.\n\n' +
    'Для регистрации нажмите кнопку ниже, чтобы поделиться номером телефона.',
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        [Markup.button.contactRequest('📱 Поделиться номером')]
      ]).oneTime().resize()
    }
  );
};

// Обработка контакта
const handleContact = async (ctx, bot, adminIds, generateCode, saveCode) => {
  const phone = ctx.message.contact.phone_number;
  const userId = ctx.from.id;
  
  // Чистим номер
  const cleanPhone = phone.startsWith('+') ? phone.substring(1) : phone;
  
  // Генерируем и сохраняем код
  const code = generateCode();
  await saveCode(cleanPhone, code);
  
  // Отправляем код пользователю
  await ctx.reply(
    `✅ *Ваш код для регистрации:*\n\n` +
    `🔢 *${code}*\n\n` +
    `⏳ Код действителен *10 минут*.\n` +
    `Вернитесь в приложение *Lap Video Chat* и введите этот код.`,
    { parse_mode: 'Markdown' }
  );
  
  // Уведомляем админов
  for (const adminId of adminIds) {
    try {
      await bot.telegram.sendMessage(
        adminId,
        `📱 *Новая регистрация*\n` +
        `Номер: \`${cleanPhone}\`\n` +
        `Код: *${code}*\n` +
        `TG ID: ${userId}\n` +
        `Время: ${new Date().toLocaleString('ru-RU')}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error(`Не удалось уведомить админа ${adminId}:`, error);
    }
  }
};

// Админ-панель
const setupAdminPanel = async (ctx, adminIds, pool) => {
  if (!adminIds.includes(ctx.from.id.toString())) {
    return ctx.reply('⛔ У вас нет доступа к админ-панели.');
  }
  
  // Получаем статистику
  const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE status = $1', ['active']);
  const pendingCount = await pool.query('SELECT COUNT(*) FROM verification_codes WHERE used = FALSE AND created_at > NOW() - INTERVAL \'10 minutes\'');
  
  await ctx.reply(
    `👨‍💻 *Админ-панель Lap Video Chat*\n\n` +
    `📊 Статистика:\n` +
    `• Активных пользователей: *${usersCount.rows[0].count}*\n` +
    `• Ожидающих регистрации: *${pendingCount.rows[0].count}*\n\n` +
    `Выберите действие:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('👥 Список пользователей', 'admin_users'),
          Markup.button.callback('🆘 Запросы помощи', 'admin_help')
        ],
        [
          Markup.button.callback('🎵 Управление музыкой', 'admin_music'),
          Markup.button.callback('🔄 Обновить', 'admin_refresh')
        ]
      ])
    }
  );
};

// Команда /help
const handleHelp = (ctx) => {
  ctx.reply(
    '🆘 *Помощь по регистрации*\n\n' +
    '1. Нажмите "Поделиться номером"\n' +
    '2. Получите 6-значный код в этом чате\n' +
    '3. Вернитесь в приложение *Lap Video Chat*\n' +
    '4. Введите полученный код\n\n' +
    'Если код не пришел, попробуйте еще раз.\n' +
    'Для связи с поддержкой используйте кнопку "Помощь" в приложении.',
    { parse_mode: 'Markdown' }
  );
};

module.exports = { handleStart, handleContact, setupAdminPanel, handleHelp };
