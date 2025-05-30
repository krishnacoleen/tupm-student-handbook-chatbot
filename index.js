require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const admin = require('firebase-admin');

/// Initialize Firebase
try {
  const serviceAccount = process.env.FIREBASE_KEY_PATH
    ? require(process.env.FIREBASE_KEY_PATH)           // for Render
    : require('./firebase-key.json');                  // for local development

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
    storageBucket: `${serviceAccount.project_id}.appspot.com`
  });

  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
  process.exit(1);
}


const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// Verify OpenRouter API key is set
if (!process.env.OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

async function askAI(prompt) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "openai/gpt-3.5-turbo",
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
  } catch (error) {
    console.error('Error calling OpenRouter:', error.response?.data || error.message);
    throw error;
  }
}

app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const handbook = JSON.parse(fs.readFileSync('./handbook.json', 'utf8'));
    const combinedContent = handbook.map(e => 
      `Section: ${e.section}\n${e.content}`
    ).join('\n\n');

    const prompt = `Refer only to the following student handbook content when answering:\n\n${combinedContent}\n\nQuestion: ${question}`;
    const answer = await askAI(prompt);

    await db.collection('chats').add({
      question,
      answer,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ answer });
  } catch (error) {
    console.error("Error in /ask route:", error);
    res.status(500).json({ 
      error: "Something went wrong",
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});