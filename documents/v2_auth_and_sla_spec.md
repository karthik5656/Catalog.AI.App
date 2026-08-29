# V2 Specification: Authentication, Authorization & API Service Level Agreements (SLAs)

This document defines the architecture, security models, role-based access controls (RBAC), and strict API performance Service Level Agreements (SLAs) for the **V2 release** of the E-Commerce Smart Merchandising & Catalog AI Platform.

---

## 1. Authentication & Authorization (AuthN & AuthZ) Architecture

```
+-----------------------------------------------------------------------------------+
|                                  FRONTEND (MFE)                                   |
|  Shell App (Auth Provider Context) -> Stores JWT in Memory & Refresh in HttpOnly  |
|  Protected Route Guards: <ProtectedRoute requiredRole="Vendor">                  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | HTTP Request (Bearer JWT Token)
                                          v
+-----------------------------------------+-----------------------------------------+
|                           API GATEWAY (YARP / .NET 8)                             |
|  - Validates JWT Signature, Issuer & Expiry                                       |
|  - Enforces IP / User Rate Limits (Redis)                                         |
|  - Injects X-User-Id, X-User-Role, X-Vendor-Id Headers Downstream                 |
+-----------------------------------------+-----------------------------------------+
                                          |
               +--------------------------+--------------------------+
               | (Vendor Token)                                      | (Public / Customer)
               v                                                     v
+--------------+--------------------------+           +--------------+--------------------------+
|       Catalog & Copilot Services        |           |    Catalog Assistant RAG Service         |
| - Policy: [Authorize(Policy="Vendor")] |           | - Public Access / Anonymous          |
| - Row-Level Tenant Security (VendorId)  |           | - IP-Based Rate Limiter (Redis)          |
+-----------------------------------------+           +-----------------------------------------+
```

### 1.1 Authentication Tokens & Strategy
* **Access Tokens (JWT)**: Short-lived (15-minute TTL). Transmitted in `Authorization: Bearer <token>` header.
* **Refresh Tokens**: Long-lived (7-day TTL). Stored in secure, `HttpOnly`, `SameSite=Strict`, `Secure` cookies to prevent XSS attacks.
* **JWT Claims Payload**:
  ```json
  {
    "sub": "usr_998877",
    "email": "vendor@store.com",
    "name": "Jane Doe",
    "role": "Vendor",
    "vendor_id": "vnd_12345",
    "iss": "https://auth.catalogplatform.local",
    "aud": "https://api.catalogplatform.local",
    "exp": 1787999999
  }
  ```

### 1.2 Frontend MFE Auth Boundaries
* **Shell Container MFE**:
  * Hosts the primary `AuthProvider` context.
  * Manages silent background token refresh (`/api/auth/refresh`) before token expiration.
  * Provides `useAuth()` hook for sub-MFEs (`catalog-mfe`, `copilot-mfe`).
* **Route & Component Guards**:
  * `Vendor Catalog MFE`: Guarded by `Vendor` or `Admin` role.
  * `Copilot MFE`: Guarded by `Vendor` or `Admin` role.
  * `Catalog Assistant MFE`: Public access; no authentication required.

### 1.3 Backend Authorization & Multi-Tenant Security (.NET 8)
* **Roles**:
  1. `Admin`: Full read/write access to all vendors, categories, products, and AI worker configs.
  2. `Vendor`: Read/write access strictly scoped to their assigned `VendorId`.
  3. `Customer`: Read-only access to published products and public assistant APIs.
* **Multi-Tenant Row-Level Security**:
  * Every EF Core DB query in `CatalogMicroservice` automatically appends `WHERE vendor_id = @CurrentVendorId` using a EF Core Global Query Filter.

---

## 2. Backend API Service Level Agreements (SLAs)

Strict performance benchmarks and SLAs ensure the platform remains responsive and reliable under load.

### 2.1 API Endpoint SLA Matrix

| Service / Endpoint | HTTP Method & Route | Latency Target (p95) | Latency Target (p99) | Target Availability | Max Error Rate | Fallback / SLA Failure Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **API Gateway** | All Routes (`/*`) | **< 15 ms** | **< 30 ms** | **99.95%** | **< 0.01%** | Return HTTP 503 / 429 Rate Limit |
| **Auth Service** | POST `/api/auth/login` | **< 100 ms** | **< 200 ms** | **99.99%** | **< 0.05%** | Lockout IP after 5 failed attempts |
| **Catalog API** | GET `/api/catalog/products` | **< 60 ms** | **< 120 ms** | **99.9%** | **< 0.1%** | Serve from Redis Cache (`catalog:list`) |
| **Catalog API** | POST `/api/catalog/products` | **< 120 ms** | **< 250 ms** | **99.9%** | **< 0.1%** | Transaction rollback & return error |
| **Copilot API** | GET `/api/catalog/products/:id/enrichment` | **< 50 ms** | **< 100 ms** | **99.9%** | **< 0.1%** | Serve from Postgres enrichment draft |
| **Catalog Assistant**| POST `/api/assistant/ask` *(Cache Hit)* | **< 20 ms** | **< 40 ms** | **99.9%** | **< 0.05%** | Return Redis cached answer |
| **Catalog Assistant**| POST `/api/assistant/ask` *(TTFT - First Token)* | **< 400 ms** | **< 800 ms** | **99.0%** | **< 0.5%** | Stream initial acknowledgment |
| **Catalog Assistant**| POST `/api/assistant/ask` *(Full RAG Stream)* | **< 2.5 sec** | **< 4.0 sec** | **99.0%** | **< 0.5%** | Fallback to static product spec sheet |

### 2.2 Asynchronous Worker & Pipeline SLAs

| Background Pipeline | Event / Queue | Processing Time SLA (p95) | Throughput SLA | Resilience / Retry Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Product Event Queue** | `ProductCreatedEvent` -> RabbitMQ | **< 20 ms queuing** | 1,000 msg/sec | Retried 3x before Dead Letter Queue (DLQ) |
| **AI SLM Enrichment** | Ollama Container Execution | **< 5.0 seconds** | 10 jobs/min per CPU | Exponential backoff via Polly (.NET) |
| **Vector Embedding Generation** | Spec Chunk Vectorization | **< 300 ms** | 100 chunks/sec | Retried asynchronously via background queue |

---

## 3. SLA Monitoring & Health Checks

1. **ASP.NET Core Health Checks**: `/healthz` endpoint exposed on all microservices checking DB connectivity, Redis ping, and RabbitMQ readiness.
2. **Prometheus Metrics & Grafana Dashboard**:
   * API request rate & error percentage (HTTP 5xx).
   * Request duration histograms (p50, p95, p99).
   * Ollama SLM token generation speed (tokens/sec).
