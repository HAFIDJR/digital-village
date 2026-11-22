ALTER TYPE "public"."attachment_status" ADD VALUE 'MENUNGGU_VERIFIKASI' BEFORE 'LENGKAP';--> statement-breakpoint
ALTER TABLE "letter_attachments" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "letter_attachments_revision_uq" ON "letter_attachments" USING btree ("request_id","doc_key","revision");