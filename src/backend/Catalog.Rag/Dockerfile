FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src

# Copy project files and restore dependencies
COPY src/backend/Catalog.Rag/Catalog.Rag/Catalog.Rag.Api.csproj              Catalog.Rag/
COPY src/backend/Catalog.Rag/Catalog.Rag.Domain/Catalog.Rag.Domain.csproj    Catalog.Rag.Domain/
COPY src/backend/Catalog.Rag/Catalog.Rag.Infra/Catalog.Rag.Infra.csproj      Catalog.Rag.Infra/
RUN dotnet restore Catalog.Rag/Catalog.Rag.Api.csproj

# Copy full source and build
COPY src/backend/Catalog.Rag/ .
RUN dotnet publish Catalog.Rag/Catalog.Rag.Api.csproj -c Release -o /app/publish --no-restore

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Catalog.Rag.Api.dll"]
