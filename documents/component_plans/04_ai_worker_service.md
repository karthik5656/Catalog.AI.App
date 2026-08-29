# Implementation Plan: AI Worker Service (.NET 8 MassTransit Worker)

## 1. Overview
The AI Worker Service is an asynchronous background consumer. It listens to `ProductCreatedEvent` messages from RabbitMQ, constructs structured prompts, calls the local containerized Ollama SLM (`Llama-3.2-3B`), parses the JSON responses, and persists enrichment drafts to PostgreSQL.

---

## 2. Component Project Structure
```
Catalog.AI.App/src/backend/AIWorkerService/
├── Consumers/
│   └── ProductCreatedConsumer.cs   # MassTransit RabbitMQ Consumer
├── Services/
│   ├── IOllamaClient.cs            # Refit / HttpClient for Ollama REST API
│   └── PromptBuilder.cs            # Structured Prompt Generator
├── Models/
│   ├── OllamaRequest.cs
│   └── EnrichmentJsonResponse.cs   # Strongly-typed JSON schema parser
├── Program.cs
└── appsettings.json
```

---

## 3. Implementation Steps

### Step 1: MassTransit Consumer Configuration
```csharp
public class ProductCreatedConsumer : IConsumer<ProductCreatedEvent>
{
    public async Task Consume(ConsumeContext<ProductCreatedEvent> context)
    {
        var prompt = _promptBuilder.BuildEnrichmentPrompt(context.Message);
        var slmResult = await _ollamaClient.GenerateAsync(prompt);
        await _repository.SaveEnrichmentDraftAsync(context.Message.ProductId, slmResult);
        await context.Publish(new ProductEnrichedEvent { ProductId = context.Message.ProductId });
    }
}
```

### Step 2: Ollama SLM Integration & System Prompt Template
```json
{
  "model": "llama3.2:3b",
  "system": "You are an expert E-Commerce Copywriter. Output strictly JSON with keys: seoTitle, marketingDescription, bulletPoints (array), generatedTags (array).",
  "prompt": "Product Title: Stainless Steel Water Bottle 750ml. Details: Insulated vacuum bottle, keeps cold 24h.",
  "stream": false,
  "format": "json"
}
```

### Step 3: Resilience Policies with Polly
Wrap Ollama HTTP calls in a Polly Resilience Pipeline:
* Retry 3 times with exponential backoff (`2s`, `4s`, `8s`).
* Circuit breaker opens after 5 consecutive failures.

---

## 4. Verification & Testing
1. Mock Ollama response and test `ProductCreatedConsumer` with xUnit.
2. Publish sample `ProductCreatedEvent` to local RabbitMQ and verify `product_enrichments` table contains generated SEO copy.
