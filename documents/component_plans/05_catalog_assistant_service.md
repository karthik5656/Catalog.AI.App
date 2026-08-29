# Implementation Plan: Catalog Assistant RAG Microservice (.NET 8)

## 1. Overview
The Catalog Assistant Microservice delivers real-time RAG (Retrieval-Augmented Generation) streaming responses to shoppers asking natural language questions about product specifications. It queries vector embeddings in PostgreSQL (`pgvector`) and streams answers using HTTP Server-Sent Events (SSE).

---

## 2. Component Project Structure
```
Catalog.AI.App/src/backend/CatalogAssistantService/
├── Controllers/
│   └── AssistantController.cs      # Streaming SSE Endpoint (/api/assistant/ask)
├── Services/
│   ├── IVectorSearchService.cs     # Dapper / EF Core pgvector similarity search
│   ├── IRagStreamService.cs        # Ollama stream reader & SSE formatter
│   └── RedisCacheService.cs        # Exact question prompt cache
├── Models/
│   ├── QuestionRequest.cs
│   └── ProductEmbeddingChunk.cs
├── Program.cs
└── appsettings.json
```

---

## 3. Database Schema & Vector Query (`vector_db`)
```sql
CREATE TABLE product_embeddings (
    id UUID PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1536) NOT NULL
);

-- Cosine Similarity Query
SELECT chunk_text 
FROM product_embeddings 
WHERE product_id = @ProductId 
ORDER BY embedding <=> @QueryVector 
LIMIT 3;
```

---

## 4. Implementation Steps

### Step 1: Redis Caching Strategy
1. Compute `SHA256(productId + questionText)`.
2. Check `assistant:cache:{hash}` in Redis.
3. If hit, return cached answer instantly (`< 20 ms`).

### Step 2: Vector Search & Context Retrieval
1. Generate query embedding via Ollama `/api/embeddings`.
2. Fetch top 3 matching chunks from `pgvector` (`< 50 ms`).

### Step 3: Server-Sent Events (SSE) Streaming
```csharp
[HttpPost("ask")]
public async Task StreamAsk([FromBody] QuestionRequest request, CancellationToken ct)
{
    Response.ContentType = "text/event-stream";
    await foreach (var token in _ragStreamService.GenerateStreamAsync(request, ct))
    {
        await Response.WriteAsync($"data: {token}\n\n", ct);
        await Response.Body.FlushAsync(ct);
    }
}
```

---

## 5. Verification & Testing
1. Integration test vector search against `pgvector` container.
2. Test streaming endpoint using `curl -N -X POST http://localhost:5002/api/assistant/ask`.
3. Verify Redis caches repeated questions.
