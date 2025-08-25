const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const OpenAI = require("openai");
const tiktoken = require('tiktoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT;

app.use(bodyParser.json());
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001'
}));
app.use(express.json());

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

const DocumentSchema = new mongoose.Schema({
    text: { type: String, required: true },
    source: { type: String, enum: ['file', 'paste'], required: true },
    createdAt: { type: Date, default: Date.now }
});

const Document = mongoose.model('Document', DocumentSchema);

async function callLLM(message) {
  const response = await openai.chat.completions.create({
    model: process.env.MODEL,
    messages: [{ role: "user", content: message }]
  });

  return(response.choices[0].message.content);
};

function chunkText(text, chunkSize=800, overlap=100) {
    const encoder = tiktoken.get_encoding("cl100k_base");
    const tokens = encoder.encode(text);
    const chunks = [];
    let start = 0;

    while (start < tokens.length) {
        let end = start + chunkSize;
        const chunkTokens = tokens.slice(start, end);
        const chunkText = new TextDecoder('utf-8').decode(encoder.decode(chunkTokens));
        chunks.push(chunkText);
        start += chunkSize - overlap;
    }

    return chunks;
};

async function getEmbedding(text) {
  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nomic-embed-text",
      prompt: String(text),
    }),
  });

  const data = await response.json();
  console.log('Embedding API response:', data);
  return data.embedding; 
}

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

app.post('/ingest', async (req, res) => {
    try {
        const { text, source } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const document = new Document({ text, source });
        await document.save();
        
        const chunks = chunkText(text);
        const embeddings = [];
        for (const [index, chunk] of chunks.entries()) {
            
            embeddings.push({
                chunk: chunk,
                embedding: await getEmbedding(chunk)
            });
        }

        console.log(embeddings);

        res.json({ 
            success: true,
            message: 'Document ingested successfully', 
            data: {
                id: document._id,
                numberOfEmbeddings: embeddings.length
            }
        });
    } catch (error) {
        console.error("Error ingesting document:", error);
        res.status(500).json({ error: 'Failed to ingest document' });
    }
});

mongoose.connect(process.env.MONGODB_URI);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
