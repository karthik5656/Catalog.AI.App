# Implementation Plan: Docker Infrastructure & Local Dev Topology

## 1. Overview
The Docker Infrastructure establishes the local development runtime using Docker Compose. It orchestrates PostgreSQL (with `pgvector`), RabbitMQ message broker, Redis cache, and an Ollama container running a slim Small Language Model (`Llama-3.2-3B` or `Phi-3-mini`).

---

## 2. Directory & File Structure
```
/docker/
├── docker-compose.yml
├── init-scripts/
│   ├── 01-init-databases.sql      # Creates catalog_db and vector_db schemas
│   └── 02-enable-pgvector.sql     # Installs pgvector extension
├── ollama/
│   └── Entrypoint.sh              # Auto-pulls slim SLM model on container start
└── README.md
```

---

## 3. Container Services & Ports

| Service Name | Image | Host Port | Internal Port | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `postgres` | `pgvector/pgvector:pg16` | `5432` | `5432` | Relational DB + Vector storage (`catalog_db`, `vector_db`) |
| `rabbitmq` | `rabbitmq:3-management-alpine` | `5672`, `15672` | `5672`, `15672` | AMQP broker & Management UI (`http://localhost:15672`) |
| `redis` | `redis:7-alpine` | `6379` | `6379` | Rate limiting, prompt cache, session store |
| `ollama` | `ollama/ollama:latest` | `11434` | `11434` | Containerized SLM inference engine |

---

## 4. Implementation Steps

### Step 1: `docker-compose.yml` Configuration
Define named volumes (`postgres_data`, `rabbitmq_data`, `redis_data`, `ollama_data`) and bridge network `backend-network`.

### Step 2: Database Initialization Script (`01-init-databases.sql`)
```sql
CREATE DATABASE catalog_db;
CREATE DATABASE vector_db;
\c vector_db;
CREATE EXTENSION IF NOT EXISTS vector;
```

### Step 3: Ollama Auto-Pull Script (`entrypoint.sh`)
```bash
#!/bin/sh
ollama serve &
sleep 5
echo "Pulling lightweight SLM model llama3.2:3b..."
ollama pull llama3.2:3b
wait
```

---

## 5. Verification & Testing
1. Run `docker compose up -d`.
2. Verify container health: `docker compose ps`.
3. Check PostgreSQL extensions: `psql -h localhost -U postgres -d vector_db -c "\dx"`.
4. Check Ollama model readiness: `curl http://localhost:11434/api/tags`.
