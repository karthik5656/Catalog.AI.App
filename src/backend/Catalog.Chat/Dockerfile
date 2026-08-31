FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src

# Copy project files and restore dependencies
COPY src/backend/Catalog.Chat/Catalog.Chat.Api/Catalog.Chat.Api.csproj        Catalog.Chat.Api/
COPY src/backend/Catalog.Chat/Catalog.Chat.Domain/Catalog.Chat.Domain.csproj  Catalog.Chat.Domain/
COPY src/backend/Catalog.Chat/Catalog.Chat.Infra/Catalog.Chat.Infra.csproj    Catalog.Chat.Infra/
RUN dotnet restore Catalog.Chat.Api/Catalog.Chat.Api.csproj

# Copy full source and build
COPY src/backend/Catalog.Chat/ .
RUN dotnet publish Catalog.Chat.Api/Catalog.Chat.Api.csproj -c Release -o /app/publish --no-restore

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Catalog.Chat.Api.dll"]
