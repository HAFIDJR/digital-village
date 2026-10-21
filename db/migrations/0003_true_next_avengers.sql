CREATE TABLE "report_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"file_name" varchar(200) NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(80) NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" smallint,
	"height" smallint,
	"caption" varchar(160),
	"uploaded_by_resident_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD COLUMN "attachment_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD COLUMN "rejected_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_report_id_citizen_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."citizen_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_uploaded_by_resident_id_residents_id_fk" FOREIGN KEY ("uploaded_by_resident_id") REFERENCES "public"."residents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_attachments_report_idx" ON "report_attachments" USING btree ("report_id");--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD CONSTRAINT "citizen_reports_rejected_by_staff_id_staff_id_fk" FOREIGN KEY ("rejected_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;