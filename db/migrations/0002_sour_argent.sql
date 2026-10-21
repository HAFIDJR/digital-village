ALTER TYPE "public"."activity_kind" ADD VALUE 'PERUBAHAN_DATA';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'PENGHAPUSAN_DATA';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'PERUBAHAN_WILAYAH';--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "subject_type" varchar(40);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "subject_ref" varchar(40);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_reads_uq" ON "notification_reads" USING btree ("notification_id","staff_id");--> statement-breakpoint
CREATE INDEX "notification_reads_staff_idx" ON "notification_reads" USING btree ("staff_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_subject_idx" ON "notifications" USING btree ("subject_type","subject_id");