# Database Tables & pgvector Setup Guide (EF Core Code-First Approach)

This document provides a complete guide for setting up PostgreSQL with the `pgvector` extension using the **EF Core Code-First** approach. It defines the required database entities, table names, properties/columns, Fluent API configurations, EF Core migrations workflow, and vector search querying for the **E-Commerce Smart Merchandising & Catalog AI Platform**.

---

## 1. Architecture & EF Core Code-First Strategy Overview

The platform uses PostgreSQL 16 separated into two logical database stores managed via dedicated EF Core `DbContext` instances:

1. **`CatalogDbContext` (`catalog_db`)**: Relational database for core product catalog management, category taxonomies, vendor product attributes, and AI enrichment workflow state.
2. **`VectorDbContext` (`vector_db`)**: Vector similarity search database equipped with the `pgvector` extension for storing product specification text chunks and high-dimensional embeddings for RAG (Retrieval-Augmented Generation).

```
+-----------------------------------------------------------------------------------+
|                        PostgreSQL 16 (EF Core Code-First)                         |
|                                                                                   |
|  +------------------------------------+   +------------------------------------+  |
|  |     CatalogDbContext (catalog_db)  |   |    VectorDbContext (vector_db)     |  |
|  |  Entities:                         |   |  Entities:                         |  |
|  |  - Category                        |   |  - ProductEmbedding (pgvector)     |  |
|  |  - Product                         |   |  - AssistantQueryLog               |  |
|  |  - ProductAttribute                |   +------------------------------------+  |
|  |  - ProductEnrichment               |                                           |
|  +------------------------------------+                                           |
+-----------------------------------------------------------------------------------+
```

### Key EF Core Code-First Principles
* **Entity Classes**: Defined in the Domain layer (`.Domain` projects) as plain C# classes.
* **Fluent API Mapping**: Entity mappings, keys, relationships, column types, and pgvector extension registration are configured in `OnModelCreating` in the Infrastructure layer (`.Infrastructure`).
* **Migrations**: Automated C# migration scripts generated using `dotnet ef migrations add` and applied via `dotnet ef database update` or programmatic auto-migration on application startup (`await dbContext.Database.MigrateAsync()`).

---

## 2. Table Specifications & C# Entity Mapping

---

### 2.1 `catalog_db` Database Entities & Mappings

#### Entity: `Category` (`categories` table)
Stores the hierarchical product taxonomy tree.

| Property / Column | Data Type / Role | Constraints & Fluent API Configuration |
| :--- | :--- | :--- |
| `Id` | `Guid` | Primary Key (`HasKey(c => c.Id)`) |
| `Name` | `string` | Not Null, Max Length 100 (`HasMaxLength(100).IsRequired()`) |
| `ParentId` | `Guid?` | Foreign Key self-reference (`HasOne(c => c.Parent).WithMany().HasForeignKey(c => c.ParentId)`) |
| `Slug` | `string` | Unique Index (`HasIndex(c => c.Slug).IsUnique()`) |
| `CreatedAt` | `DateTime` | Not Null, UTC timestamp |
| `UpdatedAt` | `DateTime` | Not Null, UTC timestamp |

#### Entity: `Product` (`products` table)
Primary aggregate root for vendor products.

| Property / Column | Data Type / Role | Constraints & Fluent API Configuration |
| :--- | :--- | :--- |
| `Id` | `Guid` | Primary Key (`HasKey(p => p.Id)`) |
| `VendorId` | `string` | Tenant Identifier, Indexed (`HasIndex(p => p.VendorId)`) |
| `CategoryId` | `Guid` | Foreign Key (`HasOne(p => p.Category).WithMany().HasForeignKey(p => p.CategoryId)`) |
| `Title` | `string` | Not Null, Max Length 200 |
| `RawDescription` | `string` | Not Null, Text column type (`HasColumnType("text")`) |
| `Price` | `decimal` | Not Null (`HasPrecision(18, 2)`) |
| `StockQuantity` | `int` | Not Null, Default 0 |
| `Sku` | `string` | Unique Index (`HasIndex(p => p.Sku).IsUnique()`) |
| `Status` | `ProductStatus` (Enum) | Stored as string (`HasConversion<string>()`) |
| `CreatedAt` | `DateTime` | Not Null, UTC timestamp |
| `UpdatedAt` | `DateTime` | Not Null, UTC timestamp |

#### Entity: `ProductAttribute` (`product_attributes` table)
Key-value pair specs for products (e.g., Color, Material, Capacity).

| Property / Column | Data Type / Role | Constraints & Fluent API Configuration |
| :--- | :--- | :--- |
| `Id` | `Guid` | Primary Key |
| `ProductId` | `Guid` | Foreign Key (`HasOne<Product>().WithMany(p => p.Attributes).HasForeignKey(a => a.ProductId)`) |
| `AttributeKey` | `string` | Not Null, Max Length 100 (e.g., "Color", "Material") |
| `AttributeValue` | `string` | Not Null, Max Length 250 (e.g., "Matte Black", "750ml") |
| `CreatedAt` | `DateTime` | Not Null, UTC timestamp |

#### Entity: `ProductEnrichment` (`product_enrichments` table)
Stores AI-generated marketing copy, SEO titles, bullet points, and vendor approval status.

| Property / Column | Data Type / Role | Constraints & Fluent API Configuration |
| :--- | :--- | :--- |
| `Id` | `Guid` | Primary Key |
| `ProductId` | `Guid` | Unique Foreign Key (`HasOne<Product>().WithOne().HasForeignKey<ProductEnrichment>(e => e.ProductId)`) |
| `SeoTitle` | `string?` | Nullable, Max Length 200 |
| `MarketingDescription` | `string?` | Nullable, Text column type (`HasColumnType("text")`) |
| `BulletPointsJson` | `string?` | Nullable, JSONB column type (`HasColumnType("jsonb")`) |
| `GeneratedTagsJson` | `string?` | Nullable, JSONB column type (`HasColumnType("jsonb")`) |
| `ModelUsed` | `string` | Not Null, Max Length 50 (e.g., "llama3.2:3b") |
| `EnrichmentStatus` | `EnrichmentStatus` (Enum) | Stored as string (`HasConversion<string>()`) |
| `ApprovedBy` | `string?` | Nullable Vendor User ID |
| `ApprovedAt` | `DateTime?` | Nullable UTC timestamp |
| `CreatedAt` | `DateTime` | Not Null, UTC timestamp |
| `UpdatedAt` | `DateTime` | Not Null, UTC timestamp |

---

### 2.2 `vector_db` Database Entities & Mappings

#### Entity: `ProductEmbedding` (`product_embeddings` table)
Stores chunked specification text and vector embeddings for RAG similarity search.

| Property / Column | Data Type / Role | Constraints & Fluent API Configuration |
| :--- | :--- | :--- |
| `Id` | `Guid` | Primary Key (`HasKey(e => e.Id)`) |
| `ProductId` | `Guid` | Not Null, Indexed (`HasIndex(e => e.ProductId)`) |
| `VendorId` | `string` | Tenant Identifier, Indexed (`HasIndex(e => e.VendorId)`) |
| `ChunkIndex` | `int` | Not Null, Sequence index of text chunk |
| `ChunkText` | `string` | Not Null, Text column type |
| `Embedding` | `Vector` (`Pgvector.Vector`) | `HasColumnType("vector(1536)")` or `vector(768)`, HNSW cosine index configured |
| `MetadataJson` | `string?` | Nullable, JSONB column type (`HasColumnType("jsonb")`) |
| `CreatedAt` | `DateTime` | Not Null, UTC timestamp |
| `UpdatedAt` | `DateTime` | Not Null, UTC timestamp |

#### Entity: `AssistantQueryLog` (`assistant_query_logs` table)
Logs shopper queries and vector RAG performance metrics.

| Property / Column | Data Type / Role | Constraints & Fluent API Configuration |
| :--- | :--- | :--- |
| `Id` | `Guid` | Primary Key |
| `ProductId` | `Guid` | Target product reference, Indexed |
| `UserId` | `string?` | Nullable Shopper/Session ID |
| `QuestionText` | `string` | Not Null, Shopper prompt text |
| `PromptHash` | `string` | Not Null, SHA256 string for Redis caching, Indexed |
| `RetrievedChunksCount` | `int` | Not Null |
| `ResponseText` | `string?` | Generated answer response snippet |
| `LatencyMs` | `long` | Response generation latency in milliseconds |
| `CreatedAt` | `DateTime` | Not Null, UTC timestamp |

---

## 3. EF Core Code-First Configuration & `pgvector` Setup

---

### Step 1: Install Required NuGet Packages

In your Infrastructure project (`CatalogAssistantService.Infrastructure.csproj`):

```bash
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add package Pgvector
dotnet add package Pgvector.EntityFrameworkCore
```

---

### Step 2: Configure `VectorDbContext` & Fluent API for `pgvector`

In `VectorDbContext.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Pgvector;
using Pgvector.EntityFrameworkCore;

public class VectorDbContext : DbContext
{
    public DbSet<ProductEmbedding> ProductEmbeddings => Set<ProductEmbedding>();
    public DbSet<AssistantQueryLog> AssistantQueryLogs => Set<AssistantQueryLog>();

    public VectorDbContext(DbContextOptions<VectorDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // 1. Register the pgvector Postgres extension in EF Core
        modelBuilder.HasPostgresExtension("vector");

        // 2. Configure ProductEmbedding Entity & Vector Column
        modelBuilder.Entity<ProductEmbedding>(entity =>
        {
            entity.ToTable("product_embeddings");
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => e.ProductId);
            entity.HasIndex(e => e.VendorId);

            // Configure vector dimensions (e.g. 1536 for OpenAI / 768 for Ollama nomic-embed-text)
            entity.Property(e => e.Embedding)
                  .HasColumnType("vector(1536)")
                  .IsRequired();

            // Configure HNSW Index with Cosine Distance via Fluent API
            entity.HasIndex(e => e.Embedding)
                  .HasMethod("hnsw")
                  .HasOperators("vector_cosine_ops");
        });

        // 3. Configure AssistantQueryLog Entity
        modelBuilder.Entity<AssistantQueryLog>(entity =>
        {
            entity.ToTable("assistant_query_logs");
            entity.HasKey(l => l.Id);
            entity.HasIndex(l => l.PromptHash);
        });
    }
}
```

---

### Step 3: Register Npgsql Vector Services in `Program.cs`

In `CatalogAssistantService.Api/Program.cs`:

```csharp
var connectionString = builder.Configuration.GetConnectionString("VectorDbConnection");

// Register Npgsql DataSource with Vector Support
var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
dataSourceBuilder.UseVector();
var dataSource = dataSourceBuilder.Build();

builder.Services.AddDbContext<VectorDbContext>(options =>
    options.UseNpgsql(dataSource, o => o.UseVector()));
```

---

### Step 4: EF Core Code-First Migrations Commands

Execute the following commands to create and apply migrations for `catalog_db` and `vector_db`:

#### 1. Generate Migrations
```bash
# Generate Catalog Microservice Migrations
dotnet ef migrations add InitialCatalogCreate \
    --project src/backend/CatalogService/CatalogService.Infrastructure \
    --startup-project src/backend/CatalogService/CatalogService.Api

# Generate Catalog Assistant Vector Migrations
dotnet ef migrations add InitialVectorCreate \
    --project src/backend/CatalogAssistantService/CatalogAssistantService.Infrastructure \
    --startup-project src/backend/CatalogAssistantService/CatalogAssistantService.Api
```

#### 2. Update Database via EF CLI (Development)
```bash
dotnet ef database update \
    --project src/backend/CatalogService/CatalogService.Infrastructure \
    --startup-project src/backend/CatalogService/CatalogService.Api

dotnet ef database update \
    --project src/backend/CatalogAssistantService/CatalogAssistantService.Infrastructure \
    --startup-project src/backend/CatalogAssistantService/CatalogAssistantService.Api
```

#### 3. Programmatic Auto-Migration on Application Startup (Production / Docker Container Startup)
In `Program.cs` of your microservices:

```csharp
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<VectorDbContext>();
    await dbContext.Database.MigrateAsync();
}
```

---

### Step 5: Executing LINQ Vector Similarity Queries with EF Core

With `Pgvector.EntityFrameworkCore`, execute type-safe LINQ vector queries using the `CosineDistance` extension method:

```csharp
public async Task<List<ProductEmbedding>> GetTopMatchingChunksAsync(
    Guid productId, 
    Vector queryVector, 
    int topK = 3, 
    CancellationToken ct = default)
{
    return await _context.ProductEmbeddings
        .AsNoTracking()
        .Where(e => e.ProductId == productId)
        .OrderBy(e => e.Embedding.CosineDistance(queryVector))
        .Take(topK)
        .ToListAsync(ct);
}
```

---

### Step 6: Verification & Health Diagnostics

1. **Verify Generated Migration Code**:
   Inspect the generated C# migration file in `Migrations/`. Ensure it contains:
   ```csharp
   migrationBuilder.AlterDatabase()
       .Annotation("Npgsql:PostgresExtension:vector", ",,");
   ```

2. **Verify Database Applied Tables via `psql`**:
   ```sql
   \c vector_db;
   SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
   \d product_embeddings;
   ```
