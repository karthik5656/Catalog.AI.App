-- Initialize Logical Databases for Catalog.AI.App
CREATE DATABASE catalog_db;
CREATE DATABASE vector_db;

-- Connect to vector_db and enable pgvector extension
\c vector_db;
CREATE EXTENSION IF NOT EXISTS vector;
