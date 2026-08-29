# Implementation Plan: E-Commerce Smart Merchandising & Catalog AI Platform

Building an end-to-end, production-ready E-Commerce Merchandising & Catalog AI platform from scratch for learning purposes. The platform utilizes React Micro Frontends (MFEs), .NET 8 Core Microservices, an event-driven architecture with RabbitMQ, Redis caching, PostgreSQL with `pgvector` for RAG/semantic search, and a slim containerized Small Language Model (SLM) running via Ollama.

---

## User Review Required

> [!IMPORTANT]
> **Learning-First Development Strategy**: The entire architecture is designed to run locally using Docker Compose, ensuring zero paid API dependencies and easy cloud migration (Azure Container Apps / AWS ECS).

> [!NOTE]
> **Lightweight LLM Selection**: We recommend using **`Llama-3.2-3B`** or **`Phi-3-mini` (3.8B)** or **`Qwen2.5-1.5B`** inside the Ollama Docker container. These models require ~2GB–4GB RAM and execute fast on standard laptop CPUs without requiring dedicated GPUs.

---

## System Architecture

```
                                +-----------------------------------+
                                |   React Micro-Frontends (Vite)    |
                                |  - Shell App                      |
                                |  - Vendor Catalog MFE             |
                                |  - AI Merchandising Copilot MFE   |
                                |  - Catalog Assistant MFE          |
                                +-----------------+-----------------+
                                                  |
                                                  v
                                +-----------------+-----------------+
                                |     API Gateway (YARP / .NET)     |
                                +-----------------+-----------------+
                                                  |
                     +----------------------------+----------------------------+
                     |                            |                            |
                     v                            v                            v
          +----------+----------+      +----------+----------+      +----------+----------+
          | Catalog Microservice |      | AI Worker Service   |      | Catalog Assistant   |
          | (.NET 8 Web API)    |      | (.NET Worker/Mass   |      | Service             |
          +----------+----------+      |  Transit)           |      | (.NET RAG Service)  |
                     |                 +----------+----------+      +----------+----------+
                     v                            ^                            |
          +----------+----------+                 |                            v
          | PostgreSQL + pgvector|                 +                 +----------+----------+
          +---------------------+       +---------+---------+       |  Ollama Docker SLM  |
                                        |    RabbitMQ       |       |  (Llama-3.2-3B /    |
          +---------------------+       | (AMQP Events)     |       |   Phi-3-mini)       |
          |        Redis        |       +-------------------+       +---------------------+
          |  (Cache & Limits)   |
          +---------------------+
```

---

## Technical Stack & Docker Infrastructure

### 1. Frontend: React Micro Frontends (MFE)
* **Framework**: React 18 + TypeScript + Vite + Module Federation / Single-SPA.
* **Styling**: Tailwind CSS + Shadcn UI or Lucide React icons.
* **State & Querying**: TanStack Query (React Query) + Zustand for local MFE state.

### 2. Backend: .NET 8 Core Microservices
* **Architecture Pattern**: Clean Architecture (Domain, Application, Infrastructure, API layers).
* **Communication**: REST APIs (external), MassTransit + RabbitMQ (async events), gRPC (internal service-to-service calls if needed).
* **Data Access**: Entity Framework Core + Dapper (for high-performance vector queries).

### 3. Docker Infrastructure (Local & Cloud Ready)
* **`ollama`**: Containerized LLM runtime hosting `Llama-3.2-3B` or `Qwen2.5-1.5B`.
* **`postgres:16`**: Relational DB with `pgvector` extension for storing product catalog data & embeddings.
* **`rabbitmq:3-management`**: AMQP message broker for asynchronous product enrichment jobs.
* **`redis:alpine`**: In-memory cache for API rate limiting, LLM response caching, and active sessions.

---

## Component Breakdown & Project Structure

### Workspace & Repository Directory Structure
```
Catalog.AI.App/
├── .github/                       # GitHub Actions workflows and CI/CD pipelines
├── docker/                        # Compose files, container init scripts & Ollama entrypoints
├── documents/                     # Platform architecture & component design documents
│   ├── component_boundaries.md
│   ├── implementation_plan.md
│   ├── sequence_diagrams.md
│   ├── v2_auth_and_sla_spec.md
│   └── component_plans/
├── src/                           # Platform source code root
│   ├── backend/                   # .NET 8 Microservices & Shared Libraries
│   │   ├── Gateway/               # YARP API Gateway
│   │   ├── CatalogService/        # Catalog Domain Microservice
│   │   ├── AIWorkerService/       # Asynchronous MassTransit AI Worker Service
│   │   ├── CatalogAssistantService/ # RAG & Vector Search Microservice
│   │   └── BuildingBlocks/        # Shared Contracts, Events & Common Utilities
│   ├── frontend/                  # React 18 + Vite Micro-Frontends (MFEs)
│   │   ├── shell/                 # Host Shell Container Application
│   │   ├── catalog-mfe/           # Vendor Catalog Management MFE
│   │   ├── copilot-mfe/           # AI Merchandising Copilot Review MFE
│   │   └── catalog-assistant-mfe/ # Customer-facing RAG Chat Assistant MFE
│   └── infrastructure/            # Infrastructure as Code, K8s manifests & deployment scripts
└── wireframes/                    # UI/UX wireframe diagrams and user flow SVGs
```

### Phase 1: Repository Setup & Docker Infrastructure
- Setup mono-repo structure under `Catalog.AI.App`:
  - Top-level folders: `.github`, `docker`, `documents`, `src`, `wireframes`.
  - Service folders under `src/`: `backend/`, `frontend/`, and `infrastructure/`.
- Write `docker-compose.yml` configuring PostgreSQL (`pgvector`), Redis, RabbitMQ, and Ollama.
- Create an entrypoint script to automatically pull the slim LLM (`ollama run llama3.2:3b`) on container startup.

### Phase 2: Backend Microservices & Event Pipeline
- **BuildingBlocks Library**: Shared contracts, MassTransit events (`ProductCreatedEvent`, `ProductEnrichmentRequestedEvent`), Exception Handling, and Logging.
- **Catalog Microservice**:
  - CRUD for Products, Categories, Attributes, Stock.
  - Publishes `ProductCreatedEvent` to RabbitMQ upon new product entry.
- **AI Merchandising Worker Service**:
  - Listens to `ProductEnrichmentRequestedEvent` from RabbitMQ.
  - Calls local Ollama API to generate:
    1. SEO-optimized title & description.
    2. Smart catalog tags & category classification.
    3. JSON structured product summary.
  - Updates Catalog DB and writes embeddings to `pgvector`.
- **Catalog Assistant RAG Service**:
  - Exposes endpoint `/api/assistant/ask`.
  - Performs similarity search on `pgvector` for matching product specs.
  - Constructs prompt and streams local SLM answer back via WebSockets/SignalR or HTTP stream.

### Phase 3: React Micro Frontends (MFE) Development
- **MFE Shell Container App**: Host application with global navbar, authentication layout, and dynamic MFE router.
- **Vendor Catalog MFE**: Product table, raw product creation form, status indicator (Draft -> Enriching -> Published).
- **AI Merchandising Copilot MFE**: Side-by-side comparison view allowing vendors to review, edit, and approve AI-generated SEO titles, bullet points, and tags.
- **Catalog Assistant MFE**: Embeddable React widget & shopper interface featuring a lightweight chat UI for natural language product questions.

### Phase 4: Integration, Caching & Performance
- Implement Redis Caching:
  - Cache identical catalog assistant prompts.
  - Cache catalog categories and frequently viewed products.
  - API Gateway rate limiting via Redis.
- Implement Resilience patterns with Polly (.NET) for Ollama HTTP client (retries, circuit breaker).

### Phase 5 (V2): Authentication, Authorization & Backend API SLAs
- **AuthN/AuthZ Implementation**:
  - Implement ASP.NET Core Identity / JWT Token authentication with short-lived Access Tokens & HttpOnly Refresh Cookies.
  - Implement Role-Based Access Control (`Admin`, `Vendor`, `Customer`) and multi-tenant row-level isolation (`VendorId` claim).
  - Shell MFE `AuthProvider` context and `<ProtectedRoute>` route guards for remote MFEs.
- **Backend API SLAs & Monitoring**:
  - API Gateway Routing & Validation SLA: **< 15 ms (p95)**.
  - Catalog CRUD API SLA: **< 60-120 ms (p95)**.
  - Catalog Assistant RAG TTFT SLA: **< 400 ms (p95)**, Full Stream **< 2.5 sec (p95)**.
  - Setup ASP.NET Health Checks (`/healthz`) and Prometheus/Grafana latency histograms.

---

## Verification & Testing Plan

### Automated Testing
- **Backend**: Unit tests (xUnit + Moq) for Clean Architecture application handlers.
- **Integration Tests**: Testcontainers for .NET with PostgreSQL and RabbitMQ.
- **Frontend**: Vitest + React Testing Library for MFE components.

### Manual & E2E Verification
1. **Docker Up Test**: Run `docker-compose up -d` and verify all containers (`ollama`, `postgres`, `rabbitmq`, `redis`) start cleanly and report healthy status.
2. **Product Enrichment Workflow**:
   - Create a basic product in Vendor Catalog MFE ("Stainless Steel Water Bottle 750ml").
   - Inspect RabbitMQ Management UI to verify `ProductCreatedEvent` message is queued and consumed.
   - Observe AI Worker logs consuming event, querying Ollama, and saving generated SEO copy/tags to Postgres.
   - Verify enriched output appears in the Copilot MFE for vendor approval.
3. **RAG Catalog Assistant Verification**:
   - Ask a question in the Catalog Assistant MFE ("Is this bottle dishwasher safe?").
   - Verify `pgvector` retrieves relevant product spec chunks and local SLM streams the answer cleanly.
