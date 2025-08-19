const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require("openai");
require('dotenv').config();

const app = express();
const port = process.env.PORT;

app.use(bodyParser.json());

let clientconfig = {};

if (process.env.PROVIDER === 'ollama') {
    clientconfig = {
        baseURL: process.env.OLLAMA_API_URL,
        apiKey: process.env.OLLAMA_API_KEY,
    };
} else if (process.env.PROVIDER === 'openai') {
    clientconfig = {
        baseURL: process.env.OPENAI_API_URL,
        apiKey: process.env.OPENAI_API_KEY,
    };
} else {
    throw new Error("Invalid PROVIDER environment variable. Must be 'ollama' or 'openai'.");    
}

const openai = new OpenAI(clientconfig);

async function callLLM(message) {
  const response = await openai.chat.completions.create({
    model: process.env.MODEL,
    messages: [{ role: "user", content: message }]
  });

  return(response.choices[0].message.content);
};

app.post('/ask', async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) {
        return res.status(400).send("Message is required");
    };

    try {
        const reply = await callLLM(userMessage);
        res.json({ reply });
    } catch (error) {
        console.error("Error calling LLM:", error);
        res.status(500).send("Error calling LLM");
    }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
