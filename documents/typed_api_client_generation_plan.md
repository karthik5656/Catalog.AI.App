# Typed API Client Generation Plan

> How to integrate **NSwag** or **Kiota** to generate strongly-typed HTTP clients for inter-service communication across the Catalog.App microservices.

---

## 1. Background & Motivation

The backend consists of four .NET 10 microservices, each following Clean Architecture (`Api`, `Domain`, `Infra`):

| Service | Role | Key Downstream Dependencies |
|---|---|---|
| **Catalog.Gateway** | YARP reverse-proxy, JWT auth, rate limiting | Proxies to all services; may need direct HTTP calls for health/aggregation |
| **Catalog.App** | Product CRUD, EF Core + PostgreSQL | — |
| **Catalog.Chat** | AI enrichment worker (MassTransit consumer) | Calls Ollama API; may call Catalog.App to write enrichments |
| **Catalog.Rag** | RAG assistant, pgvector search | May call Catalog.App for product data |

Currently there are **no typed HTTP clients** — all inter-service calls will need to be introduced as the APIs mature. Generating clients from OpenAPI specs eliminates manual `HttpClient` wiring, ensures contract consistency, and reduces boilerplate.

All services already ship **Swashbuckle.AspNetCore 10.2.3** with `AddSwaggerGen()` / `UseSwagger()` configured, so OpenAPI `swagger.json` documents are available at development time.

---

## 2. Tool Comparison: NSwag vs Kiota

### 2.1 NSwag

| Aspect | Details |
|---|---|
| **What it is** | Mature, full-featured .NET toolchain for OpenAPI code generation (C# clients, controllers, TypeScript) |
| **Generation approach** | Template-based (Liquid); generates a single `.cs` file with a complete client class |
| **Runtime dependency** | `Newtonsoft.Json` (default) or `System.Text.Json` via settings |
| **Integration options** | CLI (`nswag`), MSBuild target (`NSwag.MSBuild`), NSwagStudio GUI, or C# API |
| **OpenAPI support** | OpenAPI 2.0 (Swagger) and 3.0 |
| **Auth support** | Generates auth header parameters; manual `HttpClient` handler config |
| **Customisation** | Extensive — custom templates, operation name strategies, namespace control |
| **Maturity** | Very mature; widely adopted in .NET ecosystem |
| **Best for** | Teams wanting a single self-contained client file with minimal ceremony |

### 2.2 Kiota

| Aspect | Details |
|---|---|
| **What it is** | Microsoft's modern, cross-platform OpenAPI client generator (C#, Python, Go, Java, TypeScript, etc.) |
| **Generation approach** | Model-based; generates a folder tree of request builders + model classes |
| **Runtime dependency** | `Microsoft.Kiota.Abstractions`, `Microsoft.Kiota.Http.HttpClientLibrary`, `Microsoft.Kiota.Serialization.Json`, etc. |
| **Integration options** | CLI (`kiota`), VS Code extension, or CI pipeline |
| **OpenAPI support** | OpenAPI 2.0, 3.0, and **3.1** |
| **Auth support** | First-class auth providers (API key, Bearer, OAuth2 via `Azure.Identity`) |
| **Customisation** | Include/exclude paths, backing store for dirty-tracking, namespace control |
| **Maturity** | Actively developed by Microsoft; GA since 2023; rapidly evolving |
| **Best for** | Teams wanting idiomatic, tree-shakeable clients with rich auth and multi-language support |

### 2.3 Recommendation

| Criterion | Winner |
|---|---|
| Simplicity & quick start | **NSwag** — single file output, familiar Newtonsoft/STJ patterns |
| Long-term Microsoft alignment | **Kiota** — official Microsoft investment, OpenAPI 3.1 support |
| Multi-language (if frontend needs clients too) | **Kiota** — generates TypeScript, Python, etc. from the same spec |
| Minimal runtime dependencies | **NSwag** — no extra abstractions layer |
| Auth-provider ecosystem | **Kiota** — built-in providers for Azure AD, API key, Bearer |

> [!TIP]
> **For this project**, either tool works well. NSwag is the simpler starting point if the only consumers are .NET services. Kiota is preferable if you also want to generate TypeScript clients for the Next.js frontend or anticipate complex auth flows.

---

## 3. Integration Plan — Option A: NSwag

### 3.1 Prerequisites

- Install the `NSwag.MSBuild` NuGet package in each **consuming** project (e.g., `Catalog.Rag.Infra` if it calls `Catalog.App`).
- Alternatively, install the global CLI tool: `dotnet tool install -g NSwag.ConsoleCore`.

### 3.2 Project Structure

```
src/
  backend/
    Catalog.App/
      Catalog.App.Api/             ← Produces swagger.json
    Catalog.Rag/
      Catalog.Rag.Infra/
        ApiClients/
          Generated/
            CatalogAppClient.cs    ← Auto-generated typed client
          nswag.json               ← NSwag configuration file
```

> [!IMPORTANT]
> Generated clients should live in the **Infra** layer (not Domain) because they are infrastructure concerns — HTTP transport details that the Domain layer should not depend on.

### 3.3 NSwag Configuration File (`nswag.json`)

Create an `nswag.json` in each consuming Infra project:

```json
{
  "runtime": "Net80",
  "documentGenerator": {
    "fromDocument": {
      "url": "http://localhost:5001/swagger/v1/swagger.json"
    }
  },
  "codeGenerators": {
    "openApiToCSharpClient": {
      "className": "CatalogAppClient",
      "namespace": "Catalog.Rag.Infra.ApiClients",
      "output": "ApiClients/Generated/CatalogAppClient.cs",
      "generateClientInterfaces": true,
      "generateDtoTypes": true,
      "useBaseUrl": false,
      "jsonLibrary": "SystemTextJson",
      "operationGenerationMode": "SingleClientFromOperationId",
      "generateOptionalParameters": true,
      "generateResponseClasses": true,
      "wrapResponses": false,
      "exceptionClass": "CatalogApiException"
    }
  }
}
```

### 3.4 Generation Workflow

#### Manual / CLI

```bash
# Generate from a running service
nswag run src/backend/Catalog.Rag/Catalog.Rag.Infra/nswag.json

# Generate from a saved swagger.json file (offline)
nswag run src/backend/Catalog.Rag/Catalog.Rag.Infra/nswag.json /variables:InputJson=./openapi-specs/catalog-app.json
```

#### MSBuild Integration (build-time)

Add to the consuming `.csproj`:

```xml
<ItemGroup>
  <PackageReference Include="NSwag.MSBuild" Version="14.*">
    <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
    <PrivateAssets>all</PrivateAssets>
  </PackageReference>
</ItemGroup>

<Target Name="GenerateApiClients" BeforeTargets="CoreCompile" Inputs="$(MSBuildProjectDirectory)/nswag.json" Outputs="$(MSBuildProjectDirectory)/ApiClients/Generated/CatalogAppClient.cs">
  <Exec Command="$(NSwagExe) run nswag.json" WorkingDirectory="$(MSBuildProjectDirectory)" />
</Target>
```

### 3.5 DI Registration

In the consuming service's `Startup.cs`:

```csharp
// Startup.cs — ConfigureServices
services.AddHttpClient<ICatalogAppClient, CatalogAppClient>(client =>
{
    client.BaseAddress = new Uri(Configuration["Services:CatalogApp:BaseUrl"]!);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
});
```

### 3.6 CI/CD Pipeline Step

```yaml
# In GitHub Actions / Azure DevOps pipeline
- name: Export OpenAPI specs
  run: |
    dotnet run --project src/backend/Catalog.App/Catalog.App.Api -- --export-openapi
    # Or: curl http://localhost:5001/swagger/v1/swagger.json -o openapi-specs/catalog-app.json

- name: Generate API clients
  run: |
    dotnet tool restore
    nswag run src/backend/Catalog.Rag/Catalog.Rag.Infra/nswag.json
```

---

## 4. Integration Plan — Option B: Kiota

### 4.1 Prerequisites

- Install the Kiota CLI: `dotnet tool install -g Microsoft.OpenApi.Kiota`
- Add Kiota runtime packages to the consuming project.

### 4.2 Project Structure

```
src/
  backend/
    Catalog.App/
      Catalog.App.Api/             ← Produces swagger.json
    Catalog.Rag/
      Catalog.Rag.Infra/
        ApiClients/
          CatalogApp/
            CatalogAppClient.cs    ← Generated request builder
            Models/                ← Generated model classes
            Products/              ← Generated path-based request builders
```

### 4.3 Generation Command

```bash
kiota generate \
  --language CSharp \
  --openapi http://localhost:5001/swagger/v1/swagger.json \
  --class-name CatalogAppClient \
  --namespace-name Catalog.Rag.Infra.ApiClients.CatalogApp \
  --output src/backend/Catalog.Rag/Catalog.Rag.Infra/ApiClients/CatalogApp \
  --exclude-backward-compatible \
  --clean-output
```

### 4.4 Required NuGet Packages (consuming project)

```xml
<ItemGroup>
  <PackageReference Include="Microsoft.Kiota.Abstractions" Version="1.*" />
  <PackageReference Include="Microsoft.Kiota.Http.HttpClientLibrary" Version="1.*" />
  <PackageReference Include="Microsoft.Kiota.Serialization.Json" Version="1.*" />
  <PackageReference Include="Microsoft.Kiota.Serialization.Text" Version="1.*" />
  <PackageReference Include="Microsoft.Kiota.Serialization.Form" Version="1.*" />
  <PackageReference Include="Microsoft.Kiota.Serialization.Multipart" Version="1.*" />
  <PackageReference Include="Microsoft.Kiota.Authentication.HttpClient" Version="1.*" />
</ItemGroup>
```

### 4.5 DI Registration

```csharp
// Startup.cs — ConfigureServices
services.AddHttpClient("CatalogAppApi", client =>
{
    client.BaseAddress = new Uri(Configuration["Services:CatalogApp:BaseUrl"]!);
});

services.AddTransient<CatalogAppClient>(sp =>
{
    var httpClientFactory = sp.GetRequiredService<IHttpClientFactory>();
    var httpClient = httpClientFactory.CreateClient("CatalogAppApi");
    var authProvider = new AnonymousAuthenticationProvider(); // or ApiKeyAuthenticationProvider
    var adapter = new HttpClientRequestAdapter(authProvider, httpClient: httpClient);
    return new CatalogAppClient(adapter);
});
```

### 4.6 Usage Example (Fluent API)

```csharp
// In a MediatR handler or service class
var products = await _catalogAppClient.Api.Catalog.Products.GetAsync();
var product = await _catalogAppClient.Api.Catalog.Products[productId].GetAsync();
```

### 4.7 CI/CD Pipeline Step

```yaml
- name: Generate Kiota clients
  run: |
    dotnet tool restore
    kiota generate \
      --language CSharp \
      --openapi openapi-specs/catalog-app.json \
      --class-name CatalogAppClient \
      --namespace-name Catalog.Rag.Infra.ApiClients.CatalogApp \
      --output src/backend/Catalog.Rag/Catalog.Rag.Infra/ApiClients/CatalogApp \
      --clean-output
```

---

## 5. Shared Concerns (Both Tools)

### 5.1 OpenAPI Spec Management Strategy

Two approaches for sourcing the OpenAPI spec:

| Strategy | Pros | Cons |
|---|---|---|
| **Live endpoint** — generate from running service's `/swagger/v1/swagger.json` | Always up-to-date | Requires service to be running; not CI-friendly |
| **Committed spec files** — export specs to `openapi-specs/` folder and commit | CI-friendly; versioned; diff-able | Can drift from actual API if not kept in sync |

> [!IMPORTANT]
> **Recommended hybrid approach**: Use the `Swashbuckle.AspNetCore.Cli` tool or a startup hook to export `swagger.json` at build time, commit it to an `openapi-specs/` directory, and use that file as the generation input. Add a CI check that regenerates and fails if the output differs (drift detection).

```
openapi-specs/
  catalog-app-v1.json
  catalog-chat-v1.json
  catalog-rag-v1.json
```

### 5.2 Which Services Need Clients?

Based on the planned architecture:

| Consumer Service | Needs Client For | Reason |
|---|---|---|
| **Catalog.Gateway** | None (uses YARP proxy) | Reverse-proxy handles routing; no direct typed calls needed |
| **Catalog.Chat** | `Catalog.App` | Needs to write enrichment results back to products |
| **Catalog.Rag** | `Catalog.App` | Needs to fetch product data for RAG context |
| **Next.js Frontend** | `Catalog.Gateway` | Calls the gateway's aggregated API |

### 5.3 Interface Abstraction in Domain Layer

Regardless of tool choice, follow Clean Architecture:

```
Domain/
  Contracts/
    ICatalogAppService.cs       ← Interface defined in Domain

Infra/
  ApiClients/
    Generated/
      CatalogAppClient.cs      ← Generated code (NSwag or Kiota)
    CatalogAppServiceAdapter.cs ← Adapter implementing Domain interface, wrapping generated client
```

This keeps the Domain layer tool-agnostic. The `Infra` layer adapts the generated client to the domain contract.

### 5.4 Handling Auth Headers

Since the Gateway injects `X-User-Id`, `X-Vendor-Id`, and `X-User-Role` headers, inter-service clients behind the gateway should forward these:

```csharp
// DelegatingHandler to propagate headers
public class HeaderForwardingHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public HeaderForwardingHandler(IHttpContextAccessor httpContextAccessor)
        => _httpContextAccessor = httpContextAccessor;

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken ct)
    {
        var context = _httpContextAccessor.HttpContext;
        if (context is not null)
        {
            foreach (var header in new[] { "X-User-Id", "X-Vendor-Id", "X-User-Role" })
            {
                if (context.Request.Headers.TryGetValue(header, out var value))
                    request.Headers.TryAddWithoutValidation(header, value.ToString());
            }
        }
        return base.SendAsync(request, ct);
    }
}
```

### 5.5 Resilience & Polly

Wire up resilience policies via `Microsoft.Extensions.Http.Resilience`:

```csharp
services.AddHttpClient<ICatalogAppClient, CatalogAppClient>(client =>
{
    client.BaseAddress = new Uri(Configuration["Services:CatalogApp:BaseUrl"]!);
})
.AddStandardResilienceHandler();  // retry, circuit breaker, timeout
```

### 5.6 `.gitignore` Considerations

```gitignore
# Option 1: Commit generated clients (simpler, visible diffs)
# — no ignore rules needed

# Option 2: Generate on build (cleaner repo)
**/ApiClients/Generated/
```

---

## 6. Step-by-Step Implementation Checklist

- [ ] **Choose tool** — Decide between NSwag and Kiota based on Section 2.3
- [ ] **Enhance OpenAPI specs** — Add proper `[ProducesResponseType]`, XML doc comments, and `operationId` attributes to all controllers so generated clients have meaningful method names
- [ ] **Export specs** — Set up spec export to `openapi-specs/` directory
- [ ] **Create consuming projects structure** — Add `ApiClients/` folders in relevant Infra projects
- [ ] **Configure generation** — Create `nswag.json` (NSwag) or `kiota` config per consuming project
- [ ] **Generate initial clients** — Run generation and verify output compiles
- [ ] **Define domain contracts** — Create `ICatalogAppService` in Domain, adapter in Infra
- [ ] **Register in DI** — Wire up `HttpClient`, auth handlers, and resilience in `Startup.cs`
- [ ] **CI/CD integration** — Add generation step and drift-detection check to pipeline
- [ ] **Frontend clients** (optional) — Generate TypeScript client for Next.js frontend from Gateway spec

---

## 7. References

- [NSwag GitHub](https://github.com/RicoSuter/NSwag)
- [NSwag — ASP.NET Core Middleware](https://learn.microsoft.com/en-us/aspnet/core/tutorials/getting-started-with-nswag)
- [Kiota — Getting Started](https://learn.microsoft.com/en-us/openapi/kiota/overview)
- [Kiota — Generate .NET API Client](https://learn.microsoft.com/en-us/openapi/kiota/quickstarts/dotnet)
- [Microsoft.Extensions.Http.Resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
