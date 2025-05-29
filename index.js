const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();


const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

async function askAI(prompt) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: "openai/gpt-3.5-turbo", // Or use another model you prefer
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data.choices[0].message.content;
}

app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    const handbook = JSON.parse(fs.readFileSync('./handbook.json', 'utf8'));

    const combinedContent = handbook.map(e => `Section: ${e.section}\n${e.content}`).join('\n\n');
    const prompt = `Refer only to the following student handbook content when answering:\n\n${combinedContent}\n\nQuestion: ${question}`;

    const answer = await askAI(prompt);

    // ✅ Save to Firestore
    await db.collection('chats').add({
      question,
      answer,
      timestamp: new Date()
    });

    res.json({ answer });
  } catch (error) {
    console.error("Error in /ask route:", error?.response?.data || error.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.listen(3001, () => console.log("Server running on http://localhost:3001"));
