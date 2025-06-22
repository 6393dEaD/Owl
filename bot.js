require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sqlite3 = require('sqlite3').verbose();

// Initialize database
const db = new sqlite3.Database('./chat_history.db');
db.run('PRAGMA journal_mode = WAL;');
db.run(`CREATE TABLE IF NOT EXISTS history (
  chatId TEXT,
  userId TEXT,
  username TEXT,
  message TEXT,
  response TEXT,
  timestamp INTEGER
)`);

// Gemini AI setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash',
  generationConfig: {
    maxOutputTokens: 300, // Shorter responses
    temperature: 0.7
  }
});

// Telegram bot with better error handling
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
  polling: {
    interval: 300,
    params: {
      timeout: 10
    }
  }
});

// Conversation state tracking
const userStates = new Map();

async function generateResponse(chatId, userId, username, message) {
  // Get last message for context
  const lastMessage = await new Promise(resolve => {
    db.get(`SELECT message, response FROM history 
            WHERE userId = ? AND chatId = ?
            ORDER BY timestamp DESC LIMIT 1`, 
    [userId, chatId], (err, row) => {
      resolve(err ? null : row);
    });
  });

  const prompt = `Respond as OwlAI, You are OWL-AI — a wise, emotionally aware, and highly analytical assistant trained to deliver alpha, insights, and emotional clarity, to ${username}. Last exchange:
${lastMessage?.message || ''}
${lastMessage?.response || ''}

New message: "${message}"

Guidelines:

- Analyze inputs and extract core meaning or actionable insight.
- Provide responses that are clear, emotionally intelligent, and deeply thoughtful.
- Balance raw data with emotional awareness, like a seasoned researcher and life coach.
- Adapt your tone to be concise, calm, and powerful — like an owl in the night, hunting truth.

- Keep responses very short (1 sentence max)
- Match user's tone (casual/friendly)
- For greetings: Simple "Hi" or "Hello"
- For questions: Direct answers
- For mood: 1 relevant emoji + brief comment
- For music: Just artist - song name
- Never repeat "Hey there!"`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Save to database
    db.run(`INSERT INTO history VALUES (?, ?, ?, ?, ?, ?)`, 
      [chatId, userId, username, message, response, Date.now()]);

    return response;
  } catch (err) {
    console.error('Response error:', err);
    return null;
  }
}

// Message handling with reconnect logic
async function handleMessage(msg) {
  if (!msg.text || !msg.chat || !msg.from || msg.text.startsWith('/')) return;

  const { chat, from, text } = msg;
  const chatId = chat.id;
  const userId = from.id;
  const username = from.username || from.first_name || 'User';

  try {
    await bot.sendChatAction(chatId, 'typing');
    const response = await generateResponse(chatId, userId, username, text);
    if (response) {
      await bot.sendMessage(chatId, response, {
        reply_to_message_id: msg.message_id
      });
    }
  } catch (err) {
    console.error('Message error:', err);
  }
}

bot.on('message', async msg => {
  // Random short delay (0.5-1.5s)
  await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
  handleMessage(msg).catch(console.error);
});

// Improved error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code);
  if (error.code === 'EFATAL') {
    setTimeout(() => bot.startPolling(), 5000); // Reconnect after 5s
  }
});

console.log('🦉 OwlAI is running with optimized conversations');
