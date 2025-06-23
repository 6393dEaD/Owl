# 🧠 Emotions in Check Bot

A Telegram bot for self-awareness, journaling, and emotional balance – powered by OwlAI & Google's Gemini AI.

---

## 🌟 Overview

"**Emotions in Check**" is a Telegram bot designed to help you:

- Track your emotions
- Journal your thoughts
- Practice breathing exercises
- Monitor your emotional well-being over time

With **OwlAI**, an emotionally intelligent assistant powered by **Gemini 1.5 Flash**, you get insightful, concise responses to your prompts. Ideal for daily check-ins and mental wellness tracking.

---

## ✨ Features

- 🧠 **Emotion Tracking** – Select emotions from a predefined list and rate intensity.
- 🌀 **Multiple Emotion Selection** – Track complex moods simultaneously.
- 📓 **Journaling** – Write out your thoughts & feelings.
- 🌬️ **Breathing Exercises** – Relax with guided sessions and track progress.
- 📈 **Mood History** – View past entries and recent journal notes.
- 🏆 **Achievements** – Earn badges for consistency and emotional exploration.
- 🔥 **Streak Tracking** – Keep your mental fitness streak alive!
- 🤖 **OwlAI Integration** – Emotionally aware AI assistant, powered by Gemini.
- 💾 **Persistent Data** – Data is saved using `node-localstorage` and `sqlite3`.

---

## 🚀 Getting Started

### 🔧 Prerequisites

Make sure you have the following:

- **Node.js** (v18.x or higher)
- **Telegram Bot Token** from [BotFather](https://t.me/BotFather)
- **Google Gemini API Key** from [Google AI Studio](https://makersuite.google.com/app)

---

### 📦 Installation

1. **Clone the Repository**:
   ```bash
   git clone git@github.com:6393dEaD/Owl.git
   cd Owl


2.	Install Dependencies: 

npm install dotenv node-telegram-bot-api node-localstorage @google/generative-ai sqlite3


	3.	Set Up Environment Variables:
Create a .env file and add:

TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

▶️ Running the Bot

Run this command:

node bot.js
You should see 

Emotions in Check bot is running, powered by OwlAI...


🤖 Bot Usage

🔹 Commands
	•	/start – Launch the welcome interface.
	•	/emotion – Go straight to emotion tracking.

🔹 Inline Interactions
	•	Select Main Emotion
	•	Select Multiple Emotions
	•	Breathing Exercises
	•	History
	•	Achievements
	•	Streak
	•	Done – Exit flow

📝 Journaling

Type your thoughts as a regular message when prompted. The bot saves it automatically.

🧠 OwlAI Interaction

Send a normal message (not a command) for OwlAI to respond with intelligent insights.
