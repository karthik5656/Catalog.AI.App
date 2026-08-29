# Architecture Sequence Diagrams

This document contains detailed sequence diagrams for the key end-to-end workflows of the **E-Commerce Smart Merchandising & Catalog AI Platform**.

---

## 1. Vendor Product Creation & Async AI Merchandising Workflow

This workflow illustrates how a vendor submits a raw product entry, which is then asynchronously processed by the `.NET 8 AI Worker` microservice using the containerized `Ollama SLM`, and presented to the vendor for review in the `Copilot MFE`.

```mermaid
sequenceDiagram
    autonumber
    actor Vendor as Vendor (Browser)
    participant CatMFE as Vendor Catalog MFE
    participant CopilotMFE as Copilot MFE
    participant GW as API Gateway (YARP)
    participant CatSvc as Catalog Microservice
    participant DB as PostgreSQL (catalog_db)
    participant MQ as RabbitMQ Broker
    participant AIWorker as AI Worker Microservice
    participant SLM as Ollama Container (SLM)

    %% 1. Raw Product Creation
    Vendor->>CatMFE: Fill product form & click "Create Draft"
    CatMFE->>GW: POST /api/catalog/products (Raw Product Data)
    GW->>CatSvc: Route request
    CatSvc->>DB: INSERT into products (Status = 'Draft')
    CatSvc-->>GW: 201 Created (ProductId: prod_98765)
    GW-->>CatMFE: Product Created Response

    %% 2. Event Publishing & Asynchronous Processing
    CatSvc->>MQ: Publish ProductCreatedEvent (prod_98765)
    MQ-->>AIWorker: Consume ProductCreatedEvent
    
    %% 3. AI SLM Processing
    AIWorker->>SLM: POST /api/generate (System Prompt + Raw Product Details)
    Note over SLM: Runs Llama-3.2-3B / Phi-3 SLM<br/>Generates SEO Title, Bullet Points & Tags
    SLM-->>AIWorker: HTTP 200 JSON (Enriched Copy & Tags)

    %% 4. Saving Enrichment & Notification
    AIWorker->>DB: INSERT into product_enrichments (Status = 'Pending_Review')
    AIWorker->>DB: UPDATE products SET status = 'Pending_Review'
    AIWorker->>MQ: Publish ProductEnrichedEvent (prod_98765)
    
    %% 5. Vendor Review & Approval
    MQ-->>CatSvc: Notify completion
    CatSvc-->>CopilotMFE: Push update via SignalR / Polling
    CopilotMFE->>Vendor: Display AI Suggestions (Side-by-side Diff)
    Vendor->>CopilotMFE: Click "Approve & Publish"
    CopilotMFE->>GW: POST /api/catalog/products/prod_98765/approve
    GW->>CatSvc: Route approval
    CatSvc->>DB: UPDATE products SET status = 'Published'
    CatSvc-->>CopilotMFE: 200 OK (Published)
```

---

## 2. Catalog Assistant (RAG & Vector Search) Workflow

This workflow illustrates how a customer asks a question on a product detail page, which executes a vector similarity search over `pgvector` and streams the response from the `Ollama SLM` with Redis prompt caching.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Browser)
    participant AssistantMFE as Catalog Assistant MFE
    participant GW as API Gateway (YARP)
    participant AssistantSvc as Catalog Assistant Microservice
    participant Redis as Redis Cache
    participant VecDB as PostgreSQL (pgvector)
    participant SLM as Ollama Container (SLM)

    Customer->>AssistantMFE: Type question: "Is this bottle dishwasher safe?"
    AssistantMFE->>GW: POST /api/assistant/ask (productId, question)
    GW->>AssistantSvc: Route request

    %% Redis Cache Check
    AssistantSvc->>Redis: GET assistant:cache:{sha256(productId+question)}
    alt Cache Hit
        Redis-->>AssistantSvc: Cached Answer String
        AssistantSvc-->>GW: Return Cached Answer
        GW-->>AssistantMFE: Render Cached Answer
    else Cache Miss
        %% Vector Search & RAG
        AssistantSvc->>SLM: POST /api/embeddings (question)
        SLM-->>AssistantSvc: Embedding Vector [0.012, -0.043, ...]
        
        AssistantSvc->>VecDB: SELECT chunk_text FROM product_embeddings ORDER BY embedding <=> query_vector LIMIT 3
        VecDB-->>AssistantSvc: Top 3 Matching Product Spec Chunks
        
        %% Stream LLM Completion
        AssistantSvc->>SLM: POST /api/generate (RAG Context + Question, stream=true)
        
        loop Stream Output Chunks
            SLM-->>AssistantSvc: Token Chunk ("Yes, ")
            AssistantSvc-->>GW: SSE / Stream Chunk
            GW-->>AssistantMFE: Stream to UI
            SLM-->>AssistantSvc: Token Chunk ("it is top-rack safe...")
            AssistantSvc-->>GW: SSE / Stream Chunk
            GW-->>AssistantMFE: Stream to UI
        end
        
        AssistantSvc->>Redis: SET assistant:cache:{sha256(productId+question)} (TTL = 24h)
    end
```
