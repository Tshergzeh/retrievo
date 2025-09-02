from fastapi import FastAPI
from pydantic import BaseModel
import faiss
import numpy as np
from pymongo import MongoClient
import os
from bson import ObjectId

# --- FastAPI app ---
app = FastAPI()

# --- Constants ---
DIM = 768  # embedding dimension
INDEX_FILE = "faiss.index"

# --- MongoDB setup ---
client = MongoClient("mongodb://localhost:27017/")
db = client["retrievo"]
docs_collection = db["documents"]   # stores raw docs
map_collection = db["faiss_map"]    # stores faiss_id ↔ mongo_id mapping

# --- Load or create FAISS index ---
if os.path.exists(INDEX_FILE):
    print("Loading FAISS index from disk...")
    index = faiss.read_index(INDEX_FILE)
else:
    print("Creating new FAISS index...")
    index = faiss.IndexFlatL2(DIM)

# --- Pydantic models ---
class EmbeddingRequest(BaseModel):
    mongo_id: str
    embedding: list[float]

class SearchRequest(BaseModel):
    query_embedding: list[float]
    top_k: int = 5

# --- Add document embedding ---
@app.post("/add")
def add_vector(req: EmbeddingRequest):
    vec = np.array([req.embedding], dtype="float32")

    if vec.shape[1] != DIM:
        return {"error": f"Embedding must have dimension {DIM}"}

    # Add vector to FAISS
    index.add(vec)
    faiss_id = index.ntotal - 1

    # Save mapping in Mongo
    map_collection.insert_one({
        "faiss_id": faiss_id,
        "mongo_id": ObjectId(req.mongo_id)
    })

    # Persist FAISS index
    faiss.write_index(index, INDEX_FILE)

    return {"status": "ok", "count": index.ntotal}

# --- Search documents ---
@app.post("/search")
def search(req: SearchRequest):
    if len(req.query_embedding) != DIM:
        return {"error": f"Query embedding must have dimension {DIM}"}

    vec = np.array([req.query_embedding], dtype="float32")
    distances, indices = index.search(vec, req.top_k)

    print("FAISS index count:", index.ntotal)
    print("Search distances:", distances)
    print("Search indices:", indices)

    results = []
    for i, idx in enumerate(indices[0]):
        if idx == -1:
            continue

        mapping = map_collection.find_one({"faiss_id": int(idx)})
        if mapping:
            doc = docs_collection.find_one({"_id": mapping["mongo_id"]})
            if doc:
                results.append({
                    "id": str(doc["_id"]),
                    "text": doc["text"],
                    "distance": float(distances[0][i])
                })
                
    return {"results": results}
