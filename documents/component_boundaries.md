# Component Boundaries & Interface Contracts Specification

This document defines the strict architectural boundaries, single-responsibility rules, database ownership, event schemas, and interface contracts for each component in the **E-Commerce Smart Merchandising & Catalog AI Platform**.

---

## 1. Micro Frontends (MFE) Boundaries

```
+-----------------------------------------------------------------------+
|                              SHELL MFE                                |
|  - Layout Frame / Top Navbar / Auth Token Context                     |
|  - Dynamic Remote Module Loader (Module Federation)                   |
+---------------+-----------------------+-------------------------------+
                |                       |
                v                       v
+---------------+---------------+  +----+--------------------------+  +-------------------------------+
|     VENDOR CATALOG MFE        |  |  AI MERCHANDISING COPILOT MFE |  |    CATALOG ASSISTANT MFE      |
| - Route: /vendor/products     |  | - Route: /vendor/copilot/:id |  | - Embedded Widget / Floating |
| - Raw Product Form            |  | - Side-by-side AI Review      |  | - Streaming Answer UI         |
| - Inventory Table & Status    |  | - Approve / Edit / Reject     |  | - Spec Sheet Q&A Assistant    |
+-------------------------------+  +-------------------------------+  +-------------------------------+
```

### 1.1 Shell / Container MFE
* **Responsibility**: Application entry point, layout shell, global navigation, authentication token management, and dynamic loading of remote MFEs.
* **Owned State**: User Auth state (JWT token, user role), active route, global notifications/toast system.
* **Boundaries**:
  * MUST NOT contain domain-specific business logic for products, AI review, or assistant queries.
  * Exposes a React Context/Event Bus for cross-MFE communication (e.g., `onAuthTokenChange`, `onToastMessage`).

### 1.2 Vendor Catalog MFE
* **Responsibility**: Product creation, raw product detail management, category assignment, inventory stock updates, and product status monitoring (`Draft` | `Enriching` | `Pending Review` | `Published`).
* **Owned Routes**: `/vendor/products`, `/vendor/products/new`, `/vendor/products/:id/edit`.
* **APIs Consumed**: `CatalogService` via Gateway (`GET/POST/PUT /api/catalog/products`).
* **Boundaries**:
  * Owns the user experience for vendor product management.
  * Does NOT perform AI generation directly; triggers enrichment requests by changing product status or publishing user actions.

### 1.3 AI Merchandising Copilot MFE
* **Responsibility**: Vendor review interface for AI-generated SEO titles, marketing descriptions, feature bullet points, and auto-generated category tags.
* **Owned Routes**: `/vendor/copilot/:productId`.
* **APIs Consumed**:
  * `CatalogService` (`GET /api/catalog/products/:id/enrichment`)
  * `CatalogService` (`POST /api/catalog/products/:id/approve-enrichment`)
* **Boundaries**:
  * Purely focused on the AI approval & curation workflow.
  * Emits an approval command when vendors accept or tweak AI suggestions.

### 1.4 Catalog Assistant MFE
* **Responsibility**: Embeddable UI component meant to be rendered on customer-facing product detail pages. Allows shoppers to ask natural language questions about product specifications.
* **Owned State**: Local chat message history, streaming text response buffer, question submission state.
* **APIs Consumed**: `CatalogAssistantService` (`POST /api/assistant/ask` - Server-Sent Events / streaming HTTP).
* **Boundaries**:
  * Isolated, lightweight widget with zero dependency on Vendor MFEs.
  * Reads product spec data strictly via the `CatalogAssistantService` streaming endpoint.

---

## 2. Backend Microservices Boundaries (.NET 8 Core)

```
                                  [ Client Requests ]
                                           |
                                           v
                             +-------------+-------------+
                             |    API Gateway (YARP)     |
                             | - Rate Limiting (Redis)   |
                             | - JWT Validation          |
                             +-------------+-------------+
                                           |
                +--------------------------+--------------------------+
                |                                                     |
                v                                                     v
+---------------+---------------+                     +---------------+---------------+
|      CatalogMicroservice      |                     |   CatalogAssistantService     |
| - Domain: Products, Categories|                     | - Domain: Vector Embeddings   |
| - DB: Postgres (Catalog schema)|                    | - DB: Postgres (pgvector)     |
| - Publishes: RabbitMQ Events  |                     | - Reads: Ollama SLM           |
+---------------+---------------+                     +---------------+---------------+
                |                                                     ^
                v (RabbitMQ Event)                                    |
+---------------+---------------+                                     |
|    AIWorkerMicroservice       |-------------------------------------+
| - Listens: ProductCreated     |      (Generates & Stores Embeddings)
| - Interacts: Ollama SLM       |
| - Writes: Product Enrichment  |
+-------------------------------+
```

### 2.1 API Gateway (YARP / .NET Core)
* **Responsibility**: Reverse proxy, SSL termination, JWT access token authentication, rate limiting, request logging, and CORS policy enforcement.
* **Boundaries**:
  * Stateless service (relies on Redis for rate limit counters).
  * No business logic or database access.
* **Routing Table**:
  * `/api/catalog/*` -> `CatalogMicroservice` (`http://catalog-service:5001`)
  * `/api/assistant/*` -> `CatalogAssistantService` (`http://catalog-assistant-service:5002`)

### 2.2 Catalog Microservice
* **Responsibility**: Single source of truth for Products, Categories, Attributes, Stock, and Product Enrichment approval state.
* **Owned Storage**: PostgreSQL database schema `catalog_db`:
  * Tables: `products`, `categories`, `product_attributes`, `product_enrichments`.
* **Outbound Events**: Publishes `ProductCreatedEvent` and `ProductEnrichmentRequestedEvent` to RabbitMQ.
* **Boundaries**:
  * Only component allowed to modify the official `products` table.
  * Does NOT invoke LLMs directly; delegates heavy processing asynchronously to `AIWorkerMicroservice`.

### 2.3 AI Worker Microservice
* **Responsibility**: Asynchronous background event processor that receives enrichment requests, calls the local Ollama container, formats prompt responses, and updates enrichment data.
* **Owned Storage**: Internal worker; writes enrichment drafts to `catalog_db.product_enrichments` or publishes completion events.
* **External Integration**: Ollama API (`http://ollama:11434/api/generate`) with structured JSON schema responses.
* **Boundaries**:
  * Does NOT expose external HTTP endpoints to clients.
  * Operates strictly as a message consumer listening to RabbitMQ queues.

### 2.4 Catalog Assistant RAG Microservice
* **Responsibility**: Executes vector similarity searches over product specs and orchestrates Retrieval-Augmented Generation (RAG) streaming answers.
* **Owned Storage**: PostgreSQL database schema `vector_db` with `pgvector` extension:
  * Tables: `product_embeddings` (`product_id`, `chunk_text`, `embedding vector(1536)`).
* **Boundaries**:
  * Read-heavy service optimized for vector search and fast prompt streaming.
  * Uses Redis to cache exact-match assistant prompt responses.

---

## 3. Event-Driven Messaging Contracts (RabbitMQ + MassTransit)

All asynchronous inter-service communication flows through RabbitMQ using strongly-typed JSON message contracts.

### 3.1 `ProductCreatedEvent`
Published by `CatalogMicroservice` when a vendor creates a new product draft.

```json
{
  "eventId": "uuid-v4",
  "timestamp": "2026-08-29T19:50:00Z",
  "productId": "prod_98765",
  "vendorId": "vendor_123",
  "title": "Stainless Steel Water Bottle 750ml",
  "rawDescription": "Insulated vacuum bottle, keeps cold 24h, hot 12h. BPA free.",
  "categoryName": "Kitchen & Dining",
  "rawAttributes": {
    "Capacity": "750ml",
    "Material": "Stainless Steel",
    "Color": "Matte Black"
  }
}
```

### 3.2 `ProductEnrichedEvent`
Published by `AIWorkerMicroservice` after the SLM generates copy and smart tags.

```json
{
  "eventId": "uuid-v4",
  "timestamp": "2026-08-29T19:50:15Z",
  "productId": "prod_98765",
  "seoTitle": "HydroShield 750ml Vacuum Insulated Stainless Steel Water Bottle",
  "marketingDescription": "Stay hydrated everywhere with the HydroShield 750ml Insulated Water Bottle...",
  "bulletPoints": [
    "24-Hour Cold & 12-Hour Hot Insulation",
    "100% Eco-Friendly & BPA-Free Premium Steel",
    "Leak-Proof Ergonomic Lid"
  ],
  "generatedTags": ["hydration", "ecofriendly", "travel-gear", "insulated-bottle"],
  "modelUsed": "llama3.2:3b"
}
```

---

## 4. Caching & Session Boundaries (Redis)

Redis is used to offload databases and minimize LLM calls. Key naming convention: `{namespace}:{identifier}`.

| Key Pattern | Data Type | TTL | Purpose |
| :--- | :--- | :--- | :--- |
| `rate:{ip_address}` | String / Counter | 1 Minute | API Gateway sliding window rate limiting |
| `assistant:cache:{sha256(question_text)}` | String (JSON) | 24 Hours | Caches frequent shopper queries for identical questions |
| `catalog:categories` | String (JSON) | 1 Hour | Caches taxonomy category tree for fast frontend loading |
| `auth:session:{user_id}` | Hash | 30 Minutes | Active vendor session metadata |

---

## 5. Containerized SLM Boundaries (Ollama)

* **Host**: Container name `ollama` listening on port `11434`.
* **Model**: `Llama-3.2-3B` or `Qwen2.5-Coder-1.5B`.
* **Communication Protocol**: Internal HTTP REST API.
* **Input Schema Example**:
  ```json
  {
    "model": "llama3.2:3b",
    "prompt": "Summarize the following product specs into 3 bullet points: ...",
    "stream": false,
    "format": "json"
  }
  ```
* **Boundaries**:
  * Accessible ONLY within the internal Docker bridge network (`backend-network`).
  * Never exposed directly to the browser or API Gateway.
