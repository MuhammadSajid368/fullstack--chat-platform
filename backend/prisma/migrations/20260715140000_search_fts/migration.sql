-- PostgreSQL Full-Text Search for messages (+ supporting expression indexes).
-- Prefer tsvector + GIN. No Elasticsearch.

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

UPDATE "messages"
SET "searchVector" = to_tsvector('english', coalesce("content", ''))
WHERE "searchVector" IS NULL;

CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."content", '')), 'A');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_search_vector_trigger ON "messages";
CREATE TRIGGER messages_search_vector_trigger
BEFORE INSERT OR UPDATE OF "content" ON "messages"
FOR EACH ROW EXECUTE PROCEDURE messages_search_vector_update();

CREATE INDEX IF NOT EXISTS "messages_searchVector_gin_idx"
  ON "messages" USING GIN ("searchVector");

-- User directory FTS (active users only)
CREATE INDEX IF NOT EXISTS "users_name_email_fts_gin_idx"
  ON "users"
  USING GIN (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("email", '')))
  WHERE "deletedAt" IS NULL;

-- Group conversation name FTS
CREATE INDEX IF NOT EXISTS "conversations_name_fts_gin_idx"
  ON "conversations"
  USING GIN (to_tsvector('english', coalesce("name", '')))
  WHERE "type" = 'GROUP' AND "deletedAt" IS NULL;
