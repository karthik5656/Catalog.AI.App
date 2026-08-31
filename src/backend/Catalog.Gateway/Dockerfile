FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src

# Copy project files and restore dependencies
COPY src/backend/Catalog.Gateway/Catalog.Gateway.API/Catalog.Gateway.API.csproj        Catalog.Gateway.API/
COPY src/backend/Catalog.Gateway/Catalog.Gateway.Domain/Catalog.Gateway.Domain.csproj  Catalog.Gateway.Domain/
COPY src/backend/Catalog.Gateway/Catalog.Gateway.Infra/Catalog.Gateway.Infra.csproj    Catalog.Gateway.Infra/
RUN dotnet restore Catalog.Gateway.API/Catalog.Gateway.API.csproj

# Copy full source and build
COPY src/backend/Catalog.Gateway/ .
RUN dotnet publish Catalog.Gateway.API/Catalog.Gateway.API.csproj -c Release -o /app/publish --no-restore

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Catalog.Gateway.API.dll"]
