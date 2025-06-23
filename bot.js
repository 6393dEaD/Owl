require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { LocalStorage } = require('node-localstorage');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sqlite3 = require('sqlite3').verbose();

// Initialize LocalStorage for bot-specific user data
const localStorage = new LocalStorage('./scratch');

// Initialize SQLite database for chat history
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
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, {
  polling: {
    interval: 300,
    params: {
      timeout: 10
    }
  }
});

// --- DATA ---
const emotions = [
  { name: "Joy", color: "yellow", tips: ["Write down what caused this joy to revisit the moment.", "Share your joy with someone close.", "Dance or move your body to express this energy."], emoji: "😊", intensity: ["Cheerful", "Happy", "Ecstatic", "Euphoric"] },
  { name: "Sadness", color: "blue", tips: ["Try writing your thoughts in a journal.", "Allow yourself some rest and relaxation.", "Listen to calming music.", "Reach out to a friend."], emoji: "😢", intensity: ["Melancholy", "Sad", "Heartbroken", "Devastated"] },
  { name: "Anger", color: "red", tips: ["Take a few deep breaths.", "Try physical activity to release tension.", "Count to 10 before reacting.", "Write about what's bothering you."], emoji: "😠", intensity: ["Annoyed", "Frustrated", "Angry", "Furious"] },
  { name: "Fear", color: "purple", tips: ["Think about the worst-case scenario and how you'd handle it.", "Talk to someone you trust.", "Practice grounding techniques.", "Focus on what you can control."], emoji: "😰", intensity: ["Worried", "Anxious", "Scared", "Terrified"] },
  { name: "Calm", color: "green", tips: ["Try meditation or breathing exercises.", "Spend time in nature.", "Practice gratitude.", "Enjoy this peaceful moment."], emoji: "😌", intensity: ["Relaxed", "Peaceful", "Serene", "Tranquil"] },
  { name: "Excited", color: "orange", tips: ["Channel this energy into something productive.", "Share your excitement with others.", "Make plans for what you're excited about."], emoji: "🤩", intensity: ["Interested", "Enthusiastic", "Excited", "Thrilled"] }
];
const achievements = [
  { name: "First Entry", icon: "🌟", description: "Made your first journal entry" },
  { name: "Week Streak", icon: "🔥", description: "7 consecutive days of check-ins" },
  { name: "Emotion Explorer", icon: "🧭", description: "Experienced all core emotion types" },
  { name: "Deep Thinker", icon: "🧠", description: "Wrote 10 detailed journal entries" },
  { name: "Zen Master", icon: "🧘", description: "Completed 50 breathing exercises" }
];

// --- HELPER FUNCTIONS (for Emotions in Check bot) ---
function getUserData(userId) {
  const data = localStorage.getItem(`user_${userId}`);
  return data ? JSON.parse(data) : {
    history: [],
    streak: 0,
    unlockedAchievements: [],
    breathingCount: 0,
    currentState: 'home', // 'home', 'select_emotion', 'select_intensity', 'journal', 'select_multiple', 'breathing', 'history', 'achievements'
    selectedEmotion: null,
    selectedIntensity: 0,
    journalText: '',
    multipleEmotions: []
  };
}

function saveUserData(userId, data) {
  localStorage.setItem(`user_${userId}`, JSON.stringify(data));
}

function checkAchievements(userId, newHistory) {
    const userData = getUserData(userId);
    const newlyUnlocked = [];

    if (newHistory.length === 1 && !userData.unlockedAchievements.includes("First Entry")) {
        newlyUnlocked.push("First Entry");
    }
    const detailedEntries = newHistory.filter(entry => entry.text && entry.text.split(' ').length >= 50);
    if (detailedEntries.length >= 10 && !userData.unlockedAchievements.includes("Deep Thinker")) {
        newlyUnlocked.push("Deep Thinker");
    }
    const uniqueEmotionsLogged = new Set(newHistory.flatMap(entry => entry.emotions));
    if (uniqueEmotionsLogged.size >= emotions.length && !userData.unlockedAchievements.includes("Emotion Explorer")) {
        newlyUnlocked.push("Emotion Explorer");
    }
    if (userData.streak >= 7 && !userData.unlockedAchievements.includes("Week Streak")) {
        newlyUnlocked.push("Week Streak");
    }
    if (newlyUnlocked.length > 0) {
        userData.unlockedAchievements = [...userData.unlockedAchievements, ...newlyUnlocked];
        saveUserData(userId, userData);
        return `Achievement unlocked: ${newlyUnlocked.join(', ')}! 🎉`;
    }
    return null;
}

// --- GEMINI AI RESPONSE GENERATION ---
async function generateOwlAIResponse(chatId, userId, username, message) {
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
    console.error('Gemini AI response error:', err);
    return null;
  }
}

// --- COMMAND HANDLERS (for Emotions in Check bot) ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const welcomeMessage = `😊 *Welcome to Emotions in Check!* 💙\n\n` +
    `Simply select an emotion, write if you'd like, and get helpful tips. ` +
    `It also tracks your streaks and achievements to keep you motivated! 🏆\n\n` +
    `*Quick commands:*\n` +
    `- /emotion - Start tracking\n` +
    `- Breathing exercises 🧘\n` +
    `- Mood history 📖\n` +
    `- Done button ✅ to exit\n\n` +
    `Perfect for daily emotional check-ins! 💙`;

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "Get Started ➡️", callback_data: "start_tracking" }]
      ]
    }
  });
});

bot.onText(/\/emotion/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userData = getUserData(userId);

  showHomeView(chatId, userId, userData);
});

// --- VIEW FUNCTIONS (for Emotions in Check bot) ---
function showHomeView(chatId, userId, userData, messageId = null) {
  userData.currentState = 'home';
  saveUserData(userId, userData);

  const text = `🌟 *Emotions in Check* 🌟\n\nHow are you feeling today?`;
  const keyboard = {
    inline_keyboard: [
      [{ text: "Select Main Emotion", callback_data: "select_emotion" }],
      [{ text: "Select Multiple Emotions", callback_data: "select_multiple" }],
      [{ text: `🧘 Breathing Exercises (${userData.breathingCount})`, callback_data: "breathing_exercise" }],
      [{ text: "📖 History", callback_data: "view_history" }],
      [{ text: "🏆 Achievements", callback_data: "view_achievements" }],
      [{ text: `🔥 Streak: ${userData.streak} days`, callback_data: "streak_info" }],
      [{ text: "✅ Done", callback_data: "done_and_delete" }]
    ]
  };

  const options = { parse_mode: 'Markdown', reply_markup: keyboard };

  if (messageId) {
    bot.editMessageText(text, { ...options, chat_id: chatId, message_id: messageId });
  } else {
    bot.sendMessage(chatId, text, options);
  }
}

function showEmotionSelection(chatId, userId, messageId) {
  const userData = getUserData(userId);
  userData.currentState = 'select_emotion';
  saveUserData(userId, userData);

  const keyboard = {
    inline_keyboard: emotions.map(emotion => [
      { text: `${emotion.emoji} ${emotion.name}`, callback_data: `emotion_${emotion.name}` }
    ]).concat([[{ text: "⬅️ Back", callback_data: "back_to_home" }]])
  };

  bot.editMessageText("Select your main emotion:", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

function showMultipleEmotionSelection(chatId, userId, messageId) {
  const userData = getUserData(userId);
  userData.currentState = 'select_multiple';
  saveUserData(userId, userData);

  const keyboardRows = [];
  for (let i = 0; i < emotions.length; i += 2) {
    const row = [];
    if (i < emotions.length) {
      const emotion1 = emotions[i];
      const isSelected1 = userData.multipleEmotions.some(e => e.name === emotion1.name);
      row.push({ text: `${isSelected1 ? '✅ ' : ''}${emotion1.emoji} ${emotion1.name}`, callback_data: `multi_${emotion1.name}` });
    }
    if (i + 1 < emotions.length) {
      const emotion2 = emotions[i + 1];
      const isSelected2 = userData.multipleEmotions.some(e => e.name === emotion2.name);
      row.push({ text: `${isSelected2 ? '✅ ' : ''}${emotion2.emoji} ${emotion2.name}`, callback_data: `multi_${emotion2.name}` });
    }
    keyboardRows.push(row);
  }

  keyboardRows.push([
    { text: "📝 Journal These Emotions", callback_data: "journal_multiple" },
    { text: "⬅️ Back", callback_data: "back_to_home" }
  ]);

  bot.editMessageText("Select multiple emotions (toggle on/off):", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboardRows }
  });
}

function showIntensitySelection(chatId, userId, emotionName, messageId) {
  const userData = getUserData(userId);
  const emotion = emotions.find(e => e.name === emotionName);
  userData.currentState = 'select_intensity';
  userData.selectedEmotion = emotion;
  saveUserData(userId, userData);

  const keyboard = {
    inline_keyboard: [
      emotion.intensity.map((level, index) => ({ text: level, callback_data: `intensity_${index}` })),
      [{ text: "⬅️ Back", callback_data: "back_to_emotions" }]
    ]
  };

  bot.editMessageText(`Select intensity for ${emotion.emoji} ${emotion.name}:`, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

function showJournalView(chatId, userId, messageId) {
  const userData = getUserData(userId);
  userData.currentState = 'journal';
  saveUserData(userId, userData);

  let emotionText;
  if (userData.selectedEmotion) {
    emotionText = `${userData.selectedEmotion.emoji} ${userData.selectedEmotion.name} (${userData.selectedEmotion.intensity[userData.selectedIntensity]})`;
  } else if (userData.multipleEmotions.length > 0) {
    emotionText = userData.multipleEmotions.map(e => `${e.emoji} ${e.name}`).join(', ');
  } else {
    emotionText = "No emotion selected";
  }

  const tips = userData.selectedEmotion
    ? `\n\n*Tips for ${userData.selectedEmotion.name}:*\n• ${userData.selectedEmotion.tips.join('\n• ')}`
    : userData.multipleEmotions.length > 0
      ? `\n\n*Tips for your mix of emotions:*\nTry writing about what you're feeling and why. Reflect on how these emotions interact.`
      : '';

  const text = `📝 *Journal Entry*\n\nEmotion: ${emotionText}${tips}\n\nPlease write your thoughts below:`;

  bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "💾 Save (After you type)", callback_data: "save_journal" }],
        [{ text: "⬅️ Cancel", callback_data: "cancel_journal" }]
      ]
    }
  });
}

function saveJournalEntry(chatId, userId, text) {
  const userData = getUserData(userId);

  if (!text && !userData.selectedEmotion && userData.multipleEmotions.length === 0) {
    bot.sendMessage(chatId, "Please select an emotion or write something before saving.");
    return;
  }

  const newEntry = {
    emotions: userData.selectedEmotion ? [userData.selectedEmotion.name] : userData.multipleEmotions.map(e => e.name),
    intensity: userData.selectedEmotion ? userData.selectedIntensity : undefined,
    text: text || '',
    date: new Date().toISOString()
  };

  const newHistory = [...userData.history, newEntry];
  userData.history = newHistory;

  // Update streak
  const today = new Date().toDateString();
  // Check if the last entry was not today, or if this is the very first entry
  const lastEntryDate = userData.history.length > 1 ? new Date(userData.history[userData.history.length - 2].date).toDateString() : null;

  if (lastEntryDate !== today) {
    userData.streak += 1;
  } else if (userData.history.length === 1) { // First ever entry
    userData.streak = 1;
  }

  const achievementMessage = checkAchievements(userId, newHistory);

  // Reset journal state
  userData.selectedEmotion = null;
  userData.multipleEmotions = [];
  userData.journalText = '';
  saveUserData(userId, userData);

  // Send confirmation
  bot.sendMessage(chatId, "✅ Journal entry saved successfully!");

  // Show achievement if unlocked
  if (achievementMessage) {
    bot.sendMessage(chatId, achievementMessage);
  }

  // Return to home view
  showHomeView(chatId, userId, userData);
}

function startBreathingExercise(chatId, userId, messageId) {
  const userData = getUserData(userId);
  userData.currentState = 'breathing';
  saveUserData(userId, userData);

  // Clear any existing intervals to prevent multiple exercises running
  if (userData.breathingInterval) {
    clearInterval(userData.breathingInterval);
  }

  bot.editMessageText("🧘 *Breathing Exercise*\n\nGet ready to begin...", {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: "Stop Exercise", callback_data: "stop_breathing" }]]
    }
  });

  const steps = [
    { text: "Breathe in... 🌬️", delay: 4000 },
    { text: "Hold... ✋", delay: 4000 },
    { text: "Breathe out... 💨", delay: 4000 },
    { text: "Hold... ✋", delay: 4000 }
  ];

  let currentStep = 0;
  const totalCycles = 3;
  let cyclesCompleted = 0;

  function updateBreathingMessage() {
    // Check if the current state is still 'breathing' to prevent running after stop
    const currentData = getUserData(userId);
    if (currentData.currentState !== 'breathing') {
      clearInterval(userData.breathingInterval); // Ensure interval is cleared
      return;
    }

    if (currentStep >= steps.length) {
      currentStep = 0;
      cyclesCompleted++;
    }

    if (cyclesCompleted >= totalCycles) {
      clearInterval(userData.breathingInterval); // Clear interval when done
      userData.breathingCount += 1;
      saveUserData(userId, userData);

      if (userData.breathingCount >= 50 && !userData.unlockedAchievements.includes("Zen Master")) {
        userData.unlockedAchievements.push("Zen Master");
        saveUserData(userId, userData);
        bot.sendMessage(chatId, "🏆 Achievement unlocked: Zen Master! 🧘");
      }

      bot.editMessageText("✅ Breathing exercise completed! Great job! 🧘", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: "Back to Home", callback_data: "back_to_home" }]]
        }
      });
      return;
    }

    const step = steps[currentStep];
    bot.editMessageText(`🧘 *Breathing Exercise*\n\n${step.text}\n\nCycle ${cyclesCompleted + 1}/${totalCycles}`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: "Stop Exercise", callback_data: "stop_breathing" }]]
      }
    });

    currentStep++;
    userData.breathingInterval = setTimeout(updateBreathingMessage, step.delay);
    saveUserData(userId, userData); // Save the interval ID
  }

  userData.breathingInterval = setTimeout(updateBreathingMessage, 1000);
  saveUserData(userId, userData); // Save initial interval ID
}


function showHistoryView(chatId, userId, messageId) {
  const userData = getUserData(userId);
  userData.currentState = 'history';
  saveUserData(userId, userData);

  let text;
  if (userData.history.length === 0) {
    text = "No entries yet. Start by selecting how you feel!";
  } else {
    const emotionCounts = {};
    emotions.forEach(e => emotionCounts[e.name] = 0);
    userData.history.forEach(entry => {
      entry.emotions.forEach(emotion => {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      });
    });

    let statsMessage = "📊 *Your Emotional Journey*\n\n";
    emotions.forEach(emotion => {
      if (emotionCounts[emotion.name] > 0) {
        statsMessage += `${emotion.emoji} ${emotion.name}: ${emotionCounts[emotion.name]} entries\n`;
      }
    });

    const recentEntries = userData.history.slice(-5).reverse();
    let entriesMessage = "\n📖 *Recent Entries*\n";
    recentEntries.forEach((entry) => {
      const emotionsText = entry.emotions.map(name => {
        const emotion = emotions.find(e => e.name === name);
        return emotion ? emotion.emoji : name;
      }).join(' ');
      const intensityText = entry.intensity !== undefined && entry.emotions.length === 1 ? ` (${emotions.find(e => e.name === entry.emotions[0]).intensity[entry.intensity]})` : '';
      const textPreview = entry.text ? `\n${entry.text.substring(0, 50)}${entry.text.length > 50 ? '...' : ''}` : '';
      entriesMessage += `\n${emotionsText}${intensityText} - ${new Date(entry.date).toLocaleString()}${textPreview}`;
    });
    text = statsMessage + entriesMessage;
  }

  bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Back", callback_data: "back_to_home" }]]
    }
  });
}

function showAchievementsView(chatId, userId, messageId) {
  const userData = getUserData(userId);
  userData.currentState = 'achievements';
  saveUserData(userId, userData);

  let message = "🏆 *Your Achievements*\n\n";
  achievements.forEach(achievement => {
    const isUnlocked = userData.unlockedAchievements.includes(achievement.name);
    message += `${isUnlocked ? '✅' : '🔒'} ${achievement.icon} *${achievement.name}* - ${achievement.description}\n`;
  });

  bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Back", callback_data: "back_to_home" }]]
    }
  });
}

// --- CALLBACK QUERY HANDLER ---
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  const messageId = message.message_id;

  const userData = getUserData(userId);

  switch (true) {
    case data === 'start_tracking':
      showHomeView(chatId, userId, userData, messageId);
      break;

    case data === 'back_to_home':
      // When going back to home, ensure any pending journal state is cleared
      userData.selectedEmotion = null;
      userData.multipleEmotions = [];
      userData.journalText = '';
      saveUserData(userId, userData);
      showHomeView(chatId, userId, userData, messageId);
      break;

    case data === 'select_emotion':
      showEmotionSelection(chatId, userId, messageId);
      break;

    case data === 'select_multiple':
      showMultipleEmotionSelection(chatId, userId, messageId);
      break;

    case data.startsWith('emotion_'):
      const emotionName = data.split('_')[1];
      showIntensitySelection(chatId, userId, emotionName, messageId);
      break;

    case data.startsWith('intensity_'):
      const intensityIndex = parseInt(data.split('_')[1]);
      userData.selectedIntensity = intensityIndex;
      saveUserData(userId, userData);
      showJournalView(chatId, userId, messageId);
      break;

    case data.startsWith('multi_'):
      const multiEmotionName = data.split('_')[1];
      const emotion = emotions.find(e => e.name === multiEmotionName);
      const existingIndex = userData.multipleEmotions.findIndex(e => e.name === multiEmotionName);

      if (existingIndex >= 0) {
        userData.multipleEmotions.splice(existingIndex, 1);
      } else {
        userData.multipleEmotions.push(emotion);
      }

      saveUserData(userId, userData);
      showMultipleEmotionSelection(chatId, userId, messageId);
      break;

    case data === 'journal_multiple':
      if (userData.multipleEmotions.length === 0) {
        bot.answerCallbackQuery(callbackQuery.id, { text: "Please select at least one emotion" });
      } else {
        showJournalView(chatId, userId, messageId);
      }
      break;

    case data === 'back_to_emotions':
      showEmotionSelection(chatId, userId, messageId);
      break;

    case data === 'save_journal':
      bot.answerCallbackQuery(callbackQuery.id, { text: "Please type your journal entry and send it as a message." });
      break;

    case data === 'cancel_journal':
      userData.selectedEmotion = null;
      userData.multipleEmotions = [];
      userData.journalText = '';
      saveUserData(userId, userData);
      showHomeView(chatId, userId, userData, messageId);
      break;

    case data === 'done_and_delete':
      bot.deleteMessage(chatId, messageId)
        .then(() => {
          // Clear states after deleting message
          userData.selectedEmotion = null;
          userData.multipleEmotions = [];
          userData.journalText = '';
          userData.currentState = 'home'; // Reset to home
          if (userData.breathingInterval) { // Clear breathing interval if active
            clearInterval(userData.breathingInterval);
            delete userData.breathingInterval;
          }
          saveUserData(userId, userData);
        })
        .catch(err => console.error("Error deleting message:", err));
      break;

    case data === 'view_history':
      showHistoryView(chatId, userId, messageId);
      break;

    case data === 'view_achievements':
      showAchievementsView(chatId, userId, messageId);
      break;

    case data === 'breathing_exercise':
      startBreathingExercise(chatId, userId, messageId);
      break;

    case data === 'stop_breathing':
      if (userData.breathingInterval) {
        clearInterval(userData.breathingInterval);
        delete userData.breathingInterval; // Remove the interval ID from user data
      }
      userData.currentState = 'home';
      saveUserData(userId, userData);
      showHomeView(chatId, userId, userData, messageId);
      break;

    case data === 'streak_info':
      bot.answerCallbackQuery(callbackQuery.id, {
        text: `Your current streak is ${userData.streak} days! Keep it going!`,
        show_alert: true
      });
      break;

    default:
      bot.answerCallbackQuery(callbackQuery.id);
      break;
  }
});

// --- TEXT MESSAGE HANDLER ---
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name || 'User';
  const userData = getUserData(userId);

  // If user is in journaling state, save the text as a journal entry
  if (userData.currentState === 'journal') {
    saveJournalEntry(chatId, userId, msg.text);
  } else {
    // Otherwise, treat as a general message for OwlAI
    try {
      await bot.sendChatAction(chatId, 'typing');
      const response = await generateOwlAIResponse(chatId, userId, username, msg.text);
      if (response) {
        await bot.sendMessage(chatId, response, {
          reply_to_message_id: msg.message_id
        });
      }
    } catch (err) {
      console.error('General message handling error:', err);
    }
  }
});

// Improved error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code);
  if (error.code === 'EFATAL') {
    setTimeout(() => {
      console.log('Attempting to restart polling...');
      bot.startPolling();
    }, 5000); // Reconnect after 5s
  }
});

console.log("Emotions in Check bot is running, powered by OwlAI...");
