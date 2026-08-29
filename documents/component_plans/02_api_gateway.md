# Implementation Plan: API Gateway (YARP / .NET 8)

## 1. Overview
The API Gateway is built using **YARP (Yet Another Reverse Proxy)** in .NET 8. It acts as the single entry point for client traffic, handling SSL, routing, JWT authentication validation, CORS policies, and Redis-backed sliding window rate limiting.

---

## 2. Component Project Structure
```
/src/backend/Gateway/
├── ApiGateway.csproj
├── Program.cs
├── appsettings.json
├── Middleware/
│   ├── JwtClaimsHeaderMiddleware.cs  # Injects X-User-Id, X-Vendor-Id headers
│   └── RateLimitingMiddleware.cs     # Redis sliding-window rate limit
└── ProxyConfigs/
    └── yarp.json                     # Reverse proxy route & cluster definitions
```

---

## 3. Implementation Steps

### Step 1: Nuget Dependencies
* `YARP.ReverseProxy`
* `Microsoft.AspNetCore.Authentication.JwtBearer`
* `Microsoft.Extensions.Caching.StackExchangeRedis`

### Step 2: YARP Route & Cluster Rules (`appsettings.json`)
```json
{
  "ReverseProxy": {
    "Routes": {
      "catalog-route": {
        "ClusterId": "catalog-cluster",
        "Match": { "Path": "/api/catalog/{**catch-all}" }
      },
      "assistant-route": {
        "ClusterId": "assistant-cluster",
        "Match": { "Path": "/api/assistant/{**catch-all}" }
      }
    },
    "Clusters": {
      "catalog-cluster": {
        "Destinations": { "destination1": { "Address": "http://catalog-service:5001" } }
      },
      "assistant-cluster": {
        "Destinations": { "destination1": { "Address": "http://catalog-assistant-service:5002" } }
      }
    }
  }
}
```

### Step 3: Middleware Pipeline
1. CORS Policy Validation (`AllowOrigin: http://localhost:3000`).
2. Redis Rate Limiter (`Max 100 req/min per IP`).
3. JWT Authentication & Claims extraction (`X-Vendor-Id`, `X-User-Role`).

---

## 4. Verification & Testing
1. Send HTTP GET to `http://localhost:5000/api/catalog/products`.
2. Verify YARP forwards request to `CatalogMicroservice` and passes down `X-Vendor-Id` headers.
3. Test rate limiter by exceeding 100 requests/minute and verifying `HTTP 429 Too Many Requests`.
