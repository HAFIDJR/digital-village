-- Add new activity_kind enum values
ALTER TYPE "public"."activity_kind" ADD VALUE 'PERUBAHAN_DATA' BEFORE 'PENDAFTARAN_PENDUDUK';
ALTER TYPE "public"."activity_kind" ADD VALUE 'PENGHAPUSAN_DATA' BEFORE 'PERUBAHAN_DATA';
ALTER TYPE "public"."activity_kind" ADD VALUE 'PERUBAHAN_WILAYAH' BEFORE 'PENGHAPUSAN_DATA';

-- Add subject columns to notifications table
ALTER TABLE "public"."notifications" ADD COLUMN "subject_type" varchar(40);
ALTER TABLE "public"."notifications" ADD COLUMN "subject_id" uuid;
ALTER TABLE "public"."notifications" ADD COLUMN "subject_ref" varchar(40);
ALTER TABLE "public"."notifications" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Create notification_reads table for per-officer read state
CREATE TABLE "public"."notification_reads" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "village_id" uuid NOT NULL,
    "notification_id" uuid NOT NULL REFERENCES "public"."notifications" ON DELETE cascade,
    "staff_id" uuid NOT NULL REFERENCES "public"."staff" ON DELETE cascade,
    "read_at" timestamptz DEFAULT now(),
    UNIQUE ("notification_id", "staff_id")
);

CREATE INDEX "notification_reads_staff_idx" ON "public"."notification_reads" ("staff_id", "read_at");