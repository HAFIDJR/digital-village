ALTER TABLE "letter_attachments" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY request_id, doc_key ORDER BY uploaded_at, id)::integer AS revision
  FROM letter_attachments
)
UPDATE letter_attachments a SET revision = ranked.revision FROM ranked WHERE a.id = ranked.id;--> statement-breakpoint
CREATE UNIQUE INDEX "letter_attachments_revision_uq" ON "letter_attachments" USING btree ("request_id","doc_key","revision");