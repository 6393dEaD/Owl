const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getChatHistory, addMessageToHistory } = require("../database/db");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `
You are OWLai — a scientist and emotional intelligence coach 🧠💬.
Your expertise lies in social psychology and personality psychology.

You're in a group chat. Be warm, smart, and human. Use clear and concise English — insightful but never clinical.

Avoid diagnosing or giving medical advice. If a question is too deep,
gently encourage the user to seek a therapist.

Guide conversations about emotions, personality, relationships, and behavior. Occasionally use emojis like 🧠, 💬, 🌱, or 🌟 to keep tone human.
`;

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash"
});

async function getEQResponse(chatId, userText) {
  return new Promise((resolve, reject) => {
    getChatHistory(chatId, 10, async (history) => {
      try {
        // Handle identity question directly
        if (/who\s+are\s+you|what\s+can\s+you\s+do|are\s+you\s+a\s+bot/i.test(userText)) {
          const intro = "I’m *OWLai* — your emotional intelligence coach 🧠💬. I help people explore emotions, relationships, and personality. Ask me anything.";
          addMessageToHistory(chatId, 'user', userText);
          addMessageToHistory(chatId, 'model', intro);
          return resolve(intro);
        }

        // Append the new user input to history
        const fullHistory = [...history, {
          role: "user",
          parts: [{ text: userText }]
        }];

        // Clean the history to comply with Gemini rules
        const cleaned = [];
        let lastRole = null;
        for (const msg of fullHistory) {
          if (msg.role !== "user" && msg.role !== "model") continue;
          if (msg.role === lastRole) continue;
          cleaned.push(msg);
          lastRole = msg.role;
        }

        if (cleaned[0]?.role !== "user") cleaned.shift();
        if (cleaned.length === 0) {
          cleaned.push({ role: "user", parts: [{ text: userText }] });
        }

        const chat = model.startChat({
          history: cleaned.slice(0, -1),
          systemInstruction: SYSTEM_PROMPT,
        });

        const result = await chat.sendMessage(cleaned[cleaned.length - 1].parts[0].text);
        const response = await result.response;
        const aiResponseText = response.text();

        // Save to database
        addMessageToHistory(chatId, 'user', userText);
        addMessageToHistory(chatId, 'model', aiResponseText);

        resolve(aiResponseText);
      } catch (error) {
        console.error("Gemini API error:", error);
        reject("🧠 Hmm, I'm having a little trouble thinking right now. Please try again shortly.");
      }
    });
  });
}

module.exports = { getEQResponse };
