-- Run this SQL in Supabase SQL Editor to create an optimized function
-- that filters by ai_id BEFORE doing the similarity search

-- First, ensure there's an index on metadata->>'ai_id' for faster filtering
CREATE INDEX IF NOT EXISTS idx_documents_metadata_ai_id
ON documents ((metadata->>'ai_id'));

-- Create or replace the optimized function
CREATE OR REPLACE FUNCTION match_documents_by_ai (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_ai_id text
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  FROM documents
  WHERE documents.metadata->>'ai_id' = filter_ai_id
    AND 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Also update the existing match_documents function to have longer timeout
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
