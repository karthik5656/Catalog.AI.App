# Implementation Plan: Catalog Microservice (.NET 8 Clean Architecture)

## 1. Overview
The Catalog Microservice is the core domain service managing Products, Categories, Stock, and Enrichment approval states. Built with .NET 8 following Clean Architecture, it owns the `catalog_db` PostgreSQL database and publishes MassTransit events to RabbitMQ.

---

## 2. Component Project Structure
```
/src/backend/CatalogService/
├── CatalogService.Domain/           # Entities (Product, Category, EnrichmentDraft)
├── CatalogService.Application/      # CQRS Handlers (MediatR), DTOs, Validators (FluentValidation)
├── CatalogService.Infrastructure/   # EF Core DbContext, PostgreSQL Repositories, MassTransit Publisher
└── CatalogService.Api/              # Controllers, Extensions, Program.cs
```

---

## 3. Database Schema (`catalog_db`)
* **`categories`**: `id`, `name`, `parent_id`, `created_at`
* **`products`**: `id`, `vendor_id`, `title`, `raw_description`, `status` (`Draft` | `Pending_Review` | `Published`), `price`, `stock_quantity`, `created_at`
* **`product_enrichments`**: `id`, `product_id`, `seo_title`, `marketing_description`, `bullet_points` (JSONB), `tags` (JSONB), `status` (`Pending_Review` | `Approved` | `Rejected`)

---

## 4. Implementation Steps

### Step 1: Clean Architecture Setup
* Setup `MediatR` for CQRS pattern (`CreateProductCommand`, `GetProductsQuery`, `ApproveEnrichmentCommand`).
* Setup `FluentValidation` for request DTO validation.

### Step 2: EF Core & Row-Level Tenant Security
```csharp
modelBuilder.Entity<Product>().HasQueryFilter(p => p.VendorId == _tenantContext.VendorId);
```

### Step 3: Event Publishing via MassTransit
Upon successful `CreateProductCommand`, publish `ProductCreatedEvent`:
```csharp
await _publishEndpoint.Publish(new ProductCreatedEvent {
    ProductId = product.Id,
    VendorId = product.VendorId,
    Title = product.Title,
    RawDescription = product.RawDescription
}, cancellationToken);
```

---

## 5. Verification & Testing
1. Unit test command handlers using `xUnit` and `Moq`.
2. Integration test endpoints using EF Core InMemory / Testcontainers PostgreSQL.
3. Verify `ProductCreatedEvent` appears in RabbitMQ queue `product-created-event`.
