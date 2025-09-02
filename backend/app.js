const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const OpenAI = require("openai");
const tiktoken = require('tiktoken');
const axios = require('axios');
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
  return data.embedding; 
}

async function addToFaiss(id, embedding) {
    try {
        const response = await axios.post('http://localhost:8000/add', {
            mongo_id: id,
            embedding: embedding
        });

        return response.data;
    } catch (error) {
        console.error("Error adding to Faiss:", error.response?.data || error.message);
        throw error;
    }
}

async function searchFaiss(queryEmbedding, topK=5) {
    const response = await axios.post('http://localhost:8000/search', {
        query_embedding: queryEmbedding,
        top_k: topK
    });
    return response.data.results;
}

app.post('/ask', async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) {
        return res.status(400).send("Message is required");
    };

    try {
        const queryEmbedding = await getEmbedding(userMessage);
        const searchResults = await searchFaiss(queryEmbedding, 5);
        const contextChunks = searchResults.map(result => result.text).join("\n---\n");
        const ragPrompt = `Use the following context to answer the question as accurately as possible. If the answer is not present in the context, say "I don't know".\n\nContext:\n${contextChunks}\nQuestion: ${userMessage}\nAnswer:`;
        const reply = await callLLM(ragPrompt);
        console.log("LLM Reply:", reply);

        res.json({ 
            success: true,
            answer: reply,
            context: searchResults 
        });
    } catch (error) {
        console.error("Error in flow:", error);
        res.status(500).send("Failed to process the request");
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
            const embedding = await getEmbedding(chunk);
            embeddings.push({
                chunk: chunk,
                embedding: embedding
            });

            await addToFaiss(document._id.toString(), embedding);
        }

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

app.post('/search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const queryEmbedding = await getEmbedding(query);
        const results = await searchFaiss(queryEmbedding);

        res.json({ 
            success: true,
            results: results 
        });
    } catch (error) {
        console.error("Error searching documents:", error);
        res.status(500).json({ error: 'Failed to search documents' });
    }
});

mongoose.connect(process.env.MONGODB_URI);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
