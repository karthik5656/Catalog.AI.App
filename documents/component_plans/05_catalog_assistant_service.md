# Implementation Plan: Catalog Assistant RAG Microservice (.NET 8)

## 1. Overview
The Catalog Assistant Microservice delivers real-time RAG (Retrieval-Augmented Generation) streaming responses to shoppers asking natural language questions about product specifications. It uses EF Core Code-First with `Pgvector.EntityFrameworkCore` to query vector embeddings in PostgreSQL (`pgvector`) and streams answers using HTTP Server-Sent Events (SSE).

---

## 2. Component Project Structure
```
Catalog.AI.App/src/backend/CatalogAssistantService/
├── CatalogAssistantService.Domain/           # Entities (ProductEmbedding, AssistantQueryLog)
├── CatalogAssistantService.Application/      # Interfaces (IVectorSearchService, IRagStreamService), DTOs
├── CatalogAssistantService.Infrastructure/   # VectorDbContext (EF Core Code-First), Pgvector Repositories, Migrations
└── CatalogAssistantService.Api/              # Controllers (AssistantController), Extensions, Program.cs
```

---

## 3. Database Entities & Vector Search (`VectorDbContext`)

### EF Core Code-First Entity Configuration
```csharp
public class VectorDbContext : DbContext
{
    public DbSet<ProductEmbedding> ProductEmbeddings => Set<ProductEmbedding>();
    public DbSet<AssistantQueryLog> AssistantQueryLogs => Set<AssistantQueryLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("vector");

        modelBuilder.Entity<ProductEmbedding>(entity =>
        {
            entity.ToTable("product_embeddings");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Embedding).HasColumnType("vector(1536)").IsRequired();
            entity.HasIndex(e => e.Embedding).HasMethod("hnsw").HasOperators("vector_cosine_ops");
        });
    }
}
```

### EF Core LINQ Vector Similarity Search Query
```csharp
public async Task<List<ProductEmbedding>> SearchSimilarChunksAsync(Guid productId, Vector queryVector, CancellationToken ct)
{
    return await _context.ProductEmbeddings
        .AsNoTracking()
        .Where(e => e.ProductId == productId)
        .OrderBy(e => e.Embedding.CosineDistance(queryVector))
        .Take(3)
        .ToListAsync(ct);
}
```

---

## 4. Implementation Steps

### Step 1: EF Core Code-First Setup & Migrations
1. Add `Npgsql.EntityFrameworkCore.PostgreSQL` and `Pgvector.EntityFrameworkCore`.
2. Configure `VectorDbContext` with `HasPostgresExtension("vector")` and `HasMethod("hnsw")`.
3. Run `dotnet ef migrations add InitialVectorCreate` and apply with `await _context.Database.MigrateAsync()`.

### Step 2: Redis Caching Strategy
1. Compute `SHA256(productId + questionText)`.
2. Check `assistant:cache:{hash}` in Redis.
3. If hit, return cached answer instantly (`< 20 ms`).

### Step 3: Vector Search & Context Retrieval
1. Generate query embedding via Ollama `/api/embeddings`.
2. Fetch top 3 matching chunks from `pgvector` using EF Core `CosineDistance` (`< 50 ms`).

### Step 4: Server-Sent Events (SSE) Streaming
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
1. Integration test vector search against `pgvector` container using EF Core `VectorDbContext`.
2. Test streaming endpoint using `curl -N -X POST http://localhost:5002/api/assistant/ask`.
3. Verify Redis caches repeated questions.
