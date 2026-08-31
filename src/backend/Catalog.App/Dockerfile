FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src

# Copy project files and restore dependencies
COPY src/backend/Catalog.App/Catalog.App.Api/Catalog.App.Api.csproj        Catalog.App.Api/
COPY src/backend/Catalog.App/Catalog.App.Domain/Catalog.App.Domain.csproj  Catalog.App.Domain/
COPY src/backend/Catalog.App/Catalog.App.Infra/Catalog.App.Infra.csproj    Catalog.App.Infra/
RUN dotnet restore Catalog.App.Api/Catalog.App.Api.csproj

# Copy full source and build
COPY src/backend/Catalog.App/ .
RUN dotnet publish Catalog.App.Api/Catalog.App.Api.csproj -c Release -o /app/publish --no-restore

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Catalog.App.Api.dll"]
