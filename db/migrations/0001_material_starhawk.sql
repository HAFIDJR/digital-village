ALTER TYPE "public"."activity_kind" ADD VALUE 'PENDAFTARAN_PENDUDUK' BEFORE 'PENGUMUMAN';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'LAPORAN_BARU' BEFORE 'PENGUMUMAN';--> statement-breakpoint
CREATE TABLE "resident_announcement_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD COLUMN "reporter_resident_id" uuid;--> statement-breakpoint
ALTER TABLE "resident_announcement_reads" ADD CONSTRAINT "resident_announcement_reads_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_announcement_reads" ADD CONSTRAINT "resident_announcement_reads_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_announcement_reads" ADD CONSTRAINT "resident_announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resident_announcement_reads_uq" ON "resident_announcement_reads" USING btree ("resident_id","announcement_id");--> statement-breakpoint
CREATE INDEX "resident_announcement_reads_village_idx" ON "resident_announcement_reads" USING btree ("village_id");--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD CONSTRAINT "citizen_reports_reporter_resident_id_residents_id_fk" FOREIGN KEY ("reporter_resident_id") REFERENCES "public"."residents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citizen_reports_reporter_idx" ON "citizen_reports" USING btree ("reporter_resident_id","submitted_at");