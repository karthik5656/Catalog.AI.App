# AGENTS.md

Welcome to the **E-Commerce Smart Merchandising & Catalog AI Platform** repository (`Catalog.AI.App`).

This document is the authoritative engineering guide and architectural standard for all AI coding agents working on this codebase. Read and adhere strictly to the boundaries, conventions, data models,
and guardrails defined here.

---

## 1. High-Level Architecture & System Model

This platform is an enterprise-grade, learning-oriented e-commerce merchandising platform featuring:

- **.NET 10 Microservices** structured with Clean Architecture (`Api`, `Domain`, `Infra`).
- **React 19 Micro Frontends (MFEs)** using Vite and Module Federation.
- **Asynchronous Event-Driven AI Enrichment Pipeline** powered by RabbitMQ, MassTransit, and local Small Language Models (SLMs) via Ollama.
- **RAG & Semantic Retrieval Layer** using PostgreSQL with the `pgvector` extension and Redis caching.
- **Docker-First Local Infrastructure** with zero paid external API dependencies.

```
                              [ Browser / Client Traffic ]
                                           │
                                           ▼
                      ┌────────────────────────────────────────┐
                      │    API Gateway (YARP / .NET 10)        │
                      │  Port: 5000 | Redis Rate Limit | Auth  │
                      └────────────────────┬───────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                             │
                    ▼                                             ▼
     ┌──────────────────────────────┐              ┌──────────────────────────────┐
     │  Catalog Service             │              │  Catalog Assistant / RAG     │
     │  (src/backend/Catalog.App)   │              │  (src/backend/Catalog.Rag)   │
     │  Port: 5001 | EF Core CRUD   │              │  Port: 5002 | pgvector RAG   │
     └──────────────┬───────────────┘              └──────────────▲───────────────┘
                    │                                             │
       Publishes    │ (AMQP Events)                               │ LINQ Vector Search
                    ▼                                             ▼
     ┌──────────────────────────────┐              ┌──────────────────────────────┐
     │  RabbitMQ Message Broker     │              │  PostgreSQL 16               │
     │  Port: 5672 / 15672 UI       │              │  - catalog_db (Relational)   │
     └──────────────┬───────────────┘              │  - vector_db (pgvector)      │
                    │                              └──────────────▲───────────────┘
       Consumes     │                                             │
                    ▼                                             │
     ┌──────────────────────────────┐              ┌──────────────┴───────────────┐
     │  AI Enrichment Worker        │─────────────►│  Ollama Container (SLM)      │
     │  (src/backend/Catalog.Chat)  │  Generates   │  Port: 11434                 │
     │  Async MassTransit Consumer  │  Embeddings  │  Llama-3.2-3B / Qwen2.5      │
     └──────────────────────────────┘              └──────────────────────────────┘
```

---

## 2. Repository Structure & Workspace Map

```
Catalog.App/
├── .ai/                              # Copilot and AI assistance configs
├── .github/                          # GitHub Actions CI/CD workflows
├── docker/                           # Local Docker Compose topology & DB init scripts
│   └── init-scripts/
│       └── 01-init-databases.sql     # Logical database initialization (catalog_db, vector_db)
├── documents/                        # Architecture design specifications
│   ├── component_boundaries.md       # Service responsibilities & ownership boundaries
│   ├── implementation_plan.md        # Technical roadmap & implementation phases
│   ├── sequence_diagrams.md          # Runtime sequence diagrams & event flows
│   ├── v2_auth_and_sla_spec.md       # AuthN/AuthZ specifications & API SLAs
│   ├── typed_api_client_generation_plan.md # NSwag & Kiota typed client strategy
│   └── component_plans/              # Detailed component-level execution plans (01–09)
├── src/
│   ├── backend/                      # .NET 10 Microservices
│   │   ├── Catalog.App/              # Core Catalog Domain Microservice
│   │   │   ├── Catalog.App.Api/      # Web API layer (Controllers, Startup.cs, Swagger)
│   │   │   ├── Catalog.App.Domain/   # Entities, Aggregates, Enums, Domain Events
│   │   │   └── Catalog.App.Infra/    # EF Core CatalogDbContext, Repositories, MassTransit
│   │   ├── Catalog.Gateway/          # YARP Reverse Proxy & Authentication Gateway
│   │   │   ├── Catalog.Gateway.API/  # YARP route configs, rate limiting, JWT middleware
│   │   │   ├── Catalog.Gateway.Domain/
│   │   │   └── Catalog.Gateway.Infra/
│   │   ├── Catalog.Chat/             # AI Merchandising Worker & Chat Orchestration
│   │   │   ├── Catalog.Chat.Api/     # Worker endpoints & diagnostic triggers
│   │   │   ├── Catalog.Chat.Domain/  # Enrichment models & prompts
│   │   │   └── Catalog.Chat.Infra/   # MassTransit consumers & Ollama HTTP client
│   │   └── Catalog.Rag/              # Semantic Search & RAG Retrieval Microservice
│   │       ├── Catalog.Rag/          # API & SSE streaming endpoints (/api/assistant/ask)
│   │       ├── Catalog.Rag.Domain/   # ProductEmbedding, AssistantQueryLog entities
│   │       └── Catalog.Rag.Infra/    # VectorDbContext, pgvector HNSW indexing, LINQ queries
│   ├── frontend/                     # React 19 Micro Frontends Workspace
│   │   ├── package.json              # Root frontend workspace config (pnpm)
│   │   └── apps/
│   │       ├── ui-catalog/           # Host Shell MFE (Port 3000)
│   │       ├── ui-catalog-merchant/  # Merchant / Vendor Catalog MFE (Port 3001)
│   │       └── ui-catalog-consumer/  # Customer / Shopper Catalog MFE (Port 3002)
│   └── infrastructure/               # Cloud deployment assets, guides & DB setups
│       └── DATABASE_PGVECTOR_SETUP.md # Comprehensive EF Core Code-First + pgvector guide
└── wireframes/                       # UI/UX wireframes & user flow diagrams (SVGs)
```

---

## 3. Microservice Ownership & Component Boundaries

### 3.1 `Catalog.Gateway` (API Gateway)

- **Role**: Single public entry point for all web and client traffic.
- **Responsibilities**: YARP reverse-proxying, SSL termination, JWT access token authentication, IP rate limiting (Redis-backed), and request header forwarding (`X-User-Id`, `X-Vendor-Id`,
  `X-User-Role`).
- **Boundaries**: Stateless; **MUST NOT** contain domain business logic or database persistence.
- **Routing Rules**:
    - `/api/catalog/*` $\rightarrow$ `Catalog.App` (`http://catalog-service:5001`)
    - `/api/assistant/*` $\rightarrow$ `Catalog.Rag` (`http://catalog-assistant-service:5002`)

### 3.2 `Catalog.App` (Catalog Microservice)

- **Role**: Authoritative single source of truth for catalog entities.
- **Responsibilities**: CRUD operations on Products, Categories, Attributes, Stock, and Enrichment approval states.
- **Database**: Owns `catalog_db` PostgreSQL schema (`categories`, `products`, `product_attributes`, `product_enrichments`).
- **Boundaries**:
    - Sole service authorized to update the `products` table.
    - Multi-tenant tenant security: strictly enforce `VendorId` scoping on all queries via EF Core global query filters.
    - **Never** invokes LLMs/SLMs synchronously during API requests; delegates heavy AI processing asynchronously via RabbitMQ domain events.

### 3.3 `Catalog.Chat` (AI Worker & Enrichment Pipeline)

- **Role**: Background worker consuming catalog domain events.
- **Responsibilities**: Consumes `ProductCreatedEvent`, formats structured LLM prompts, calls the local Ollama SLM container, parses JSON responses, and persists enrichment drafts
  (`product_enrichments`).
- **Boundaries**:
    - Consumes from RabbitMQ queues asynchronously.
    - Protected with Polly resilience policies (retries with exponential backoff + circuit breaker).
    - Does **not** expose public client-facing CRUD endpoints.

### 3.4 `Catalog.Rag` (Catalog Assistant & Vector RAG Service)

- **Role**: Real-time vector search and Retrieval-Augmented Generation (RAG) assistant for product specs.
- **Responsibilities**: Vector similarity search over spec chunks in `vector_db` (`product_embeddings`), streaming real-time tokens to shoppers via Server-Sent Events (SSE), and caching frequent
  responses in Redis.
- **Database**: Owns `vector_db` PostgreSQL schema with `pgvector` extension and HNSW indexing.
- **Boundaries**: Read-heavy, latency-sensitive service.

---

## 4. Frontend Micro Frontend (MFE) Architecture

The frontend uses **React 19 + TypeScript + Vite + `@originjs/vite-plugin-federation`**.

| App Folder                              | Application Name   | Type                   | Dev Port | Responsibility                                                                    |
| --------------------------------------- | ------------------ | ---------------------- | -------- | --------------------------------------------------------------------------------- |
| `src/frontend/apps/ui-catalog`          | **Shell Host App** | Host                   | `3000`   | Global layout, top navigation, Auth provider context, dynamic remote MFE router   |
| `src/frontend/apps/ui-catalog-merchant` | **Merchant MFE**   | Remote (`merchantApp`) | `3001`   | Vendor product management, draft creation, AI Copilot review & approval           |
| `src/frontend/apps/ui-catalog-consumer` | **Consumer MFE**   | Remote (`consumerApp`) | `3002`   | Customer catalog browse, product detail pages, embedded RAG Chat Assistant widget |

### Frontend Workflow & Guidelines:

- **Package Manager**: **STRICTLY USE `pnpm`**. Do not run `npm` or `yarn`.
- **Remote App Configuration**: Defined in [remotes.json](file:///c:/Users/karth/Desktop/Agentic%20Coding/Catalog.App/src/frontend/apps/ui-catalog/remotes.json) and resolved dynamically in
  `remoteApps.generated.tsx`.
- **Shared Dependencies**: Shell and remotes share singletons for `react`, `react-dom`, and `react-router-dom`.
- **State Boundaries**: Keep remote MFE state self-contained. Use global context only for authentication tokens, active user profile, and global notifications.

---

## 5. Database Schemas & EF Core Code-First Standards

The PostgreSQL instance runs on port `5432` and contains two logical databases:

### 5.1 `catalog_db` (Relational Catalog Database)

- **`categories`**: `Id` (Guid, PK), `Name` (varchar 100), `ParentId` (Guid, FK nullable), `Slug` (unique), `CreatedAt`, `UpdatedAt`.
- **`products`**: `Id` (Guid, PK), `VendorId` (varchar, Indexed), `CategoryId` (Guid, FK), `Title` (varchar 200), `RawDescription` (text), `Price` (decimal 18,2), `StockQuantity` (int), `Sku`
  (varchar, unique), `Status` (`Draft` | `Pending_Review` | `Published`), `CreatedAt`, `UpdatedAt`.
- **`product_attributes`**: `Id` (Guid, PK), `ProductId` (Guid, FK), `AttributeKey` (varchar 100), `AttributeValue` (varchar 250), `CreatedAt`.
- **`product_enrichments`**: `Id` (Guid, PK), `ProductId` (Guid, unique FK), `SeoTitle` (varchar 200), `MarketingDescription` (text), `BulletPointsJson` (jsonb), `GeneratedTagsJson` (jsonb),
  `ModelUsed` (varchar 50), `EnrichmentStatus` (`Pending_Review` | `Approved` | `Rejected`), `ApprovedBy` (varchar nullable), `ApprovedAt` (DateTime nullable).

### 5.2 `vector_db` (Vector Database with `pgvector`)

- **`product_embeddings`**: `Id` (Guid, PK), `ProductId` (Guid, Indexed), `VendorId` (varchar, Indexed), `ChunkIndex` (int), `ChunkText` (text), `Embedding` (`vector(1536)` / `vector(768)` with HNSW
  cosine distance index), `MetadataJson` (jsonb), `CreatedAt`, `UpdatedAt`.
- **`assistant_query_logs`**: `Id` (Guid, PK), `ProductId` (Guid), `UserId` (varchar nullable), `QuestionText` (text), `PromptHash` (varchar 64, Indexed), `RetrievedChunksCount` (int), `ResponseText`
  (text), `LatencyMs` (bigint), `CreatedAt`.

### 5.3 EF Core LINQ Vector Similarity Query Convention

```csharp
// Use Pgvector.EntityFrameworkCore for strongly-typed LINQ vector queries
public async Task<List<ProductEmbedding>> SearchSimilarChunksAsync(
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

## 6. Asynchronous Messaging & Event Contracts (RabbitMQ + MassTransit)

All inter-service messaging uses MassTransit over RabbitMQ.

### 6.1 `ProductCreatedEvent`

Published by `Catalog.App` when a vendor saves a product draft:

```json
{
	"eventId": "uuid-v4",
	"timestamp": "2026-09-01T12:00:00Z",
	"productId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
	"vendorId": "vnd_12345",
	"title": "Stainless Steel Insulated Water Bottle 750ml",
	"rawDescription": "Double-wall vacuum insulated, keeps cold 24h, hot 12h. BPA free.",
	"categoryName": "Sports & Outdoors",
	"rawAttributes": {
		"Capacity": "750ml",
		"Material": "18/8 Stainless Steel",
		"Color": "Matte Black"
	}
}
```

### 6.2 `ProductEnrichedEvent`

Published by `Catalog.Chat` after SLM processing completes:

```json
{
	"eventId": "uuid-v4",
	"timestamp": "2026-09-01T12:00:05Z",
	"productId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
	"seoTitle": "HydroPro 750ml Vacuum Insulated Stainless Steel Thermal Water Bottle",
	"marketingDescription": "Stay refreshed all day with the HydroPro 750ml Insulated Water Bottle...",
	"bulletPoints": [
		"24-Hour Cold & 12-Hour Heat Retention with Double-Wall Vacuum Insulation",
		"Food-Grade 18/8 Stainless Steel, 100% BPA-Free & Non-Toxic",
		"Leak-Proof Sports Cap with Ergonomic Carry Loop"
	],
	"generatedTags": ["hydration", "thermal-bottle", "sports-gear", "eco-friendly"],
	"modelUsed": "llama3.2:3b"
}
```

---

## 7. Caching & Session Patterns (Redis)

Redis key naming standard: `{namespace}:{identifier}`.

| Key Pattern                                    | Type           | TTL        | Purpose                                            |
| ---------------------------------------------- | -------------- | ---------- | -------------------------------------------------- |
| `rate:{ip_address}`                            | String/Counter | 1 Minute   | Gateway sliding-window rate limit counter          |
| `assistant:cache:{sha256(productId+question)}` | String (JSON)  | 24 Hours   | Instant response for duplicate RAG shopper queries |
| `catalog:categories:tree`                      | String (JSON)  | 1 Hour     | Cached category taxonomy hierarchy                 |
| `auth:session:{user_id}`                       | Hash           | 30 Minutes | Active user session & role claims                  |

---

## 8. Backend Coding Conventions & Architecture Rules

1. **Host Configuration Pattern**:
    - Maintain the existing **`Program.cs` + `Startup.cs`** pattern across all .NET projects.
    - `Program.cs` creates and builds `IHostBuilder`.
    - `Startup.cs` contains `ConfigureServices(IServiceCollection services)` and `Configure(IApplicationBuilder app, IWebHostEnvironment env)`.
2. **Clean Architecture Layering**:
    - `*.Domain`: Entities, Value Objects, Domain Events, Repository Interfaces. **Zero external NuGet dependencies** except core abstractions.
    - `*.Infra`: EF Core `DbContext`, Database Migrations, Repository Implementations, MassTransit Consumers/Publishers, External HTTP Clients.
    - `*.Api` (or Web layer): Controllers, Middlewares, Dependency Injection registration, Swagger/OpenAPI setup.
3. **Resilience Policies (Polly)**:
    - All HTTP calls to external engines (Ollama) **MUST** use Polly resilience pipelines (3 retries with exponential backoff, circuit breaker on 5 consecutive faults).
4. **Typed API Clients**:
    - Inter-service REST calls must use typed clients generated via NSwag/Kiota located under `Infra/ApiClients/Generated`.
    - The Domain layer must reference domain interfaces (e.g., `ICatalogServiceAdapter`), never raw HTTP client implementations.
5. **OpenAPI Documentation**:
    - Always decorate controller actions with `[ProducesResponseType]`, `[Consumes]`, and XML summaries for clean client code generation.

---

## 9. Authentication, Authorization & API SLAs

### 9.1 Auth Model

- **Access Tokens**: Short-lived (15 min) JWT sent in `Authorization: Bearer <token>`.
- **Refresh Tokens**: Long-lived (7 days) stored in `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
- **Roles**: `Admin` (global management), `Vendor` (scoped to `VendorId`), `Customer` (shopper/public).
- **Gateway Claims Propagation**: YARP validates JWT and injects `X-User-Id`, `X-Vendor-Id`, and `X-User-Role` headers to downstream microservices.

### 9.2 API Performance Targets (SLA Matrix)

- **API Gateway Routing**: p95 < 15ms
- **Catalog CRUD Operations**: p95 < 60–120ms
- **Copilot Enrichment Fetch**: p95 < 50ms
- **Assistant RAG Cached Query**: p95 < 20ms
- **Assistant RAG Time-To-First-Token (TTFT)**: p95 < 400ms
- **Assistant RAG Full Stream**: p95 < 2.5s
- **AI Enrichment Background Job**: p95 < 5.0s

---

## 10. Developer Commands & Workflows

### 10.1 Frontend (pnpm only)

```bash
# Install all dependencies across workspace
cd src/frontend && pnpm install

# Run Shell host application (port 3000)
cd src/frontend/apps/ui-catalog && pnpm dev

# Run Merchant MFE (port 3001)
cd src/frontend/apps/ui-catalog-merchant && pnpm dev

# Run Consumer MFE (port 3002)
cd src/frontend/apps/ui-catalog-consumer && pnpm dev

# Lint & Typecheck
cd src/frontend/apps/ui-catalog && pnpm lint && pnpm build
```

### 10.2 Backend (.NET 10)

```bash
# Build the entire backend solution
dotnet build src/backend/Catalog.App/Catalog.App.Api.slnx
dotnet build src/backend/Catalog.Gateway/Catalog.Gateway.slnx
dotnet build src/backend/Catalog.Chat/Catalog.Chat.slnx
dotnet build src/backend/Catalog.Rag/Catalog.Rag.slnx

# Run Catalog Web API
dotnet run --project src/backend/Catalog.App/Catalog.App.Api/Catalog.App.Api.csproj

# Run Gateway
dotnet run --project src/backend/Catalog.Gateway/Catalog.Gateway.API/Catalog.Gateway.API.csproj

# EF Core Migration Commands
dotnet ef migrations add InitialCatalogCreate \
  --project src/backend/Catalog.App/Catalog.App.Infra \
  --startup-project src/backend/Catalog.App/Catalog.App.Api

dotnet ef migrations add InitialVectorCreate \
  --project src/backend/Catalog.Rag/Catalog.Rag.Infra \
  --startup-project src/backend/Catalog.Rag/Catalog.Rag/Catalog.Rag.Api.csproj
```

### 10.3 Infrastructure (Docker)

```bash
# Start all supporting local services
docker compose -f docker/docker-compose.yml up -d

# Verify container health
docker compose ps

# Check Ollama SLM model readiness
curl http://localhost:11434/api/tags
```

---

## 11. Coding Guardrails for AI Agents (DOs and DON'Ts)

### ⛔ NEVER (Strict Violations):

- **DO NOT** use `npm` or `yarn`. Always use `pnpm` for frontend commands.
- **DO NOT** place domain business logic, database queries, or data persistence inside `Catalog.Gateway`.
- **DO NOT** invoke Ollama SLM synchronously inside public catalog CRUD endpoints. AI work belongs in `Catalog.Chat` background event consumers.
- **DO NOT** mix `catalog_db` and `vector_db` tables into a single database context. Keep relational data and vector embeddings isolated.
- **DO NOT** convert ASP.NET Core projects to minimal API top-level statements. Preserve the standard `Program.cs` and `Startup.cs` pattern.
- **DO NOT** bypass multi-tenant isolation. Every query in `Catalog.App` must be scoped to `VendorId`.
- **DO NOT** hardcode secrets or connection strings in source code. Use `appsettings.json`, environment variables, or Secret Manager.

### ✅ ALWAYS (Best Practices):

- **DO** verify service and MFE boundaries before adding cross-service features.
- **DO** publish MassTransit events for asynchronous decoupling.
- **DO** place EF Core entity mappings and migrations in `*.Infra` and domain entities in `*.Domain`.
- **DO** use `Pgvector.EntityFrameworkCore` LINQ queries with `CosineDistance` for vector similarity searches.
- **DO** maintain Module Federation contracts and shared dependency configs when modifying MFE remotes.
- **DO** check [documents/component_boundaries.md](documents/component_boundaries.md) and [documents/v2_auth_and_sla_spec.md](documents/v2_auth_and_sla_spec.md) when making architectural changes.
