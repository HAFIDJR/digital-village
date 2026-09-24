CREATE TYPE "public"."activity_kind" AS ENUM('PENGAJUAN_BARU', 'VERIFIKASI_BERKAS', 'PENOLAKAN', 'PERSETUJUAN', 'TANDA_TANGAN', 'CETAK_SURAT', 'MUTASI_PENDUDUK', 'PENGUMUMAN', 'MASUK_LOG');--> statement-breakpoint
CREATE TYPE "public"."announcement_channel" AS ENUM('WEBSITE_DESA', 'PAPAN_INFORMASI', 'PENGUMUMAN_WA');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('DRAF', 'TERJADWAL', 'TERBIT', 'DIARSIPKAN');--> statement-breakpoint
CREATE TYPE "public"."attachment_status" AS ENUM('LENGKAP', 'BURAM', 'TIDAK_ADA', 'TIDAK_RELEVAN');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('L', 'P');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('BELUM_MENIKAH', 'KAWIN', 'CERAI_HIDUP', 'CERAI_MATI');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('NORMAL', 'PRIORITAS', 'DARURAT');--> statement-breakpoint
CREATE TYPE "public"."religion" AS ENUM('ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU', 'LAINNYA');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('PENDING_VERIFIKASI', 'BERKAS_TIDAK_LENGKAP', 'DIVERIFIKASI', 'MENUNGGU_TTD_KADES', 'DITANDATANGANI', 'SIAP_DIAMBIL', 'SELESAI', 'DITOLAK');--> statement-breakpoint
CREATE TYPE "public"."resident_status" AS ENUM('AKTIF', 'PINDAH_KELUAR', 'MENINGGAL', 'TIDAK_DIKENAL');--> statement-breakpoint
CREATE TYPE "public"."signature_status" AS ENUM('MENUNGGU', 'DITANDATANGANI', 'KEDALUWARSA', 'DIBATALKAN');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('OPERATOR_DESA', 'SEKDES', 'KASI_PELAYANAN', 'KAUR_TU', 'KADES', 'KADUS');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"summary" varchar(300) NOT NULL,
	"subject_type" varchar(40),
	"subject_id" uuid,
	"subject_ref" varchar(40),
	"actor_staff_id" uuid,
	"actor_name" varchar(120) NOT NULL,
	"actor_initials" varchar(4) NOT NULL,
	"actor_role" varchar(60) NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(220) NOT NULL,
	"excerpt" varchar(320),
	"body" text NOT NULL,
	"channel" "announcement_channel" DEFAULT 'WEBSITE_DESA' NOT NULL,
	"status" "announcement_status" DEFAULT 'DRAF' NOT NULL,
	"priority" "priority" DEFAULT 'NORMAL' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"attachment_count" smallint DEFAULT 0 NOT NULL,
	"audience" varchar(80) DEFAULT 'Seluruh Warga' NOT NULL,
	"author_staff_id" uuid,
	"publish_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citizen_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket" varchar(20) NOT NULL,
	"village_id" uuid NOT NULL,
	"reporter_name" varchar(120) NOT NULL,
	"reporter_nik" varchar(16),
	"reporter_phone" varchar(32),
	"neighborhood_id" uuid,
	"category" varchar(60) NOT NULL,
	"subject" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'NEW' NOT NULL,
	"priority" "priority" DEFAULT 'NORMAL' NOT NULL,
	"handled_by_staff_id" uuid,
	"response_count" smallint DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"village_id" uuid NOT NULL,
	"stat_date" date NOT NULL,
	"letters_received" integer DEFAULT 0 NOT NULL,
	"letters_completed" integer DEFAULT 0 NOT NULL,
	"letters_rejected" integer DEFAULT 0 NOT NULL,
	"letters_printed" integer DEFAULT 0 NOT NULL,
	"active_residents" integer DEFAULT 0 NOT NULL,
	"active_families" integer DEFAULT 0 NOT NULL,
	"reports_new" integer DEFAULT 0 NOT NULL,
	"dana_desa_disbursed" numeric(16, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_stats_village_id_stat_date_pk" PRIMARY KEY("village_id","stat_date")
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"kk_number" varchar(16) NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	"address" text NOT NULL,
	"head_name" varchar(120) NOT NULL,
	"welfare_class" varchar(32),
	"member_count" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hamlets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"code" varchar(16) NOT NULL,
	"head_name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"doc_key" varchar(40) NOT NULL,
	"label" varchar(120) NOT NULL,
	"file_name" varchar(200) NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(80) NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "attachment_status" DEFAULT 'LENGKAP' NOT NULL,
	"defect_note" varchar(160),
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_by_staff_id" uuid
);
--> statement-breakpoint
CREATE TABLE "letter_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket" varchar(20) NOT NULL,
	"village_id" uuid NOT NULL,
	"letter_type_id" uuid NOT NULL,
	"applicant_resident_id" uuid,
	"applicant_name" varchar(120) NOT NULL,
	"applicant_nik" varchar(16) NOT NULL,
	"applicant_phone" varchar(32),
	"family_id" uuid,
	"neighborhood_id" uuid NOT NULL,
	"address" text NOT NULL,
	"purpose" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "request_status" DEFAULT 'PENDING_VERIFIKASI' NOT NULL,
	"priority" "priority" DEFAULT 'NORMAL' NOT NULL,
	"channel" varchar(24) DEFAULT 'WEBSITE' NOT NULL,
	"documents_uploaded" smallint DEFAULT 0 NOT NULL,
	"documents_required" smallint DEFAULT 0 NOT NULL,
	"compliance_note" varchar(120),
	"assigned_staff_id" uuid,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"verification_code" varchar(32) NOT NULL,
	"agenda_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"letter_type_id" uuid NOT NULL,
	"doc_key" varchar(40) NOT NULL,
	"label" varchar(120) NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"code" varchar(12) NOT NULL,
	"name" varchar(160) NOT NULL,
	"template_title" varchar(200) NOT NULL,
	"description" text,
	"sla_days" smallint DEFAULT 2 NOT NULL,
	"requires_kades_signature" boolean DEFAULT true NOT NULL,
	"fee_idr" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neighborhoods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hamlet_id" uuid NOT NULL,
	"rt" smallint NOT NULL,
	"rw" smallint NOT NULL,
	"head_name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"recipient_staff_id" uuid,
	"title" varchar(160) NOT NULL,
	"body" varchar(320),
	"severity" varchar(16) DEFAULT 'INFO' NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resident_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"effective_date" date NOT NULL,
	"notes" text,
	"recorded_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"family_id" uuid,
	"nik" varchar(16) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"gender" "gender" NOT NULL,
	"birth_place" varchar(80) NOT NULL,
	"birth_date" date NOT NULL,
	"religion" "religion" DEFAULT 'ISLAM' NOT NULL,
	"marital_status" "marital_status" DEFAULT 'BELUM_MENIKAH' NOT NULL,
	"education" varchar(48),
	"occupation" varchar(80),
	"nationality" varchar(48) DEFAULT 'WNI' NOT NULL,
	"family_relation" varchar(48),
	"neighborhood_id" uuid NOT NULL,
	"address" text NOT NULL,
	"phone" varchar(32),
	"status" "resident_status" DEFAULT 'AKTIF' NOT NULL,
	"documents_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"requested_by_staff_id" uuid,
	"signer_staff_id" uuid,
	"status" "signature_status" DEFAULT 'MENUNGGU' NOT NULL,
	"certificate_serial" varchar(64),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"job_title" varchar(120) NOT NULL,
	"role" "staff_role" NOT NULL,
	"nipd" varchar(32),
	"email" varchar(160) NOT NULL,
	"phone" varchar(32),
	"avatar_url" text,
	"initials" varchar(4) NOT NULL,
	"can_sign" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"station" varchar(80) NOT NULL,
	"ip_address" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "villages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"district" varchar(120) NOT NULL,
	"regency" varchar(120) NOT NULL,
	"province" varchar(120) NOT NULL,
	"postal_code" varchar(8) NOT NULL,
	"village_code" varchar(16) NOT NULL,
	"head_name" varchar(120) NOT NULL,
	"head_nipd" varchar(32),
	"office_address" text NOT NULL,
	"office_phone" varchar(32) NOT NULL,
	"office_email" varchar(160) NOT NULL,
	"website" varchar(160),
	"seal_url" text,
	"established_year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_staff_id_staff_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD CONSTRAINT "citizen_reports_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD CONSTRAINT "citizen_reports_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_reports" ADD CONSTRAINT "citizen_reports_handled_by_staff_id_staff_id_fk" FOREIGN KEY ("handled_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hamlets" ADD CONSTRAINT "hamlets_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_attachments" ADD CONSTRAINT "letter_attachments_request_id_letter_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_attachments" ADD CONSTRAINT "letter_attachments_verified_by_staff_id_staff_id_fk" FOREIGN KEY ("verified_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_letter_type_id_letter_types_id_fk" FOREIGN KEY ("letter_type_id") REFERENCES "public"."letter_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_applicant_resident_id_residents_id_fk" FOREIGN KEY ("applicant_resident_id") REFERENCES "public"."residents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_assigned_staff_id_staff_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requirements" ADD CONSTRAINT "letter_requirements_letter_type_id_letter_types_id_fk" FOREIGN KEY ("letter_type_id") REFERENCES "public"."letter_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_types" ADD CONSTRAINT "letter_types_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_hamlet_id_hamlets_id_fk" FOREIGN KEY ("hamlet_id") REFERENCES "public"."hamlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_staff_id_staff_id_fk" FOREIGN KEY ("recipient_staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_mutations" ADD CONSTRAINT "resident_mutations_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_mutations" ADD CONSTRAINT "resident_mutations_recorded_by_staff_id_staff_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_request_id_letter_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_requested_by_staff_id_staff_id_fk" FOREIGN KEY ("requested_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_signer_staff_id_staff_id_fk" FOREIGN KEY ("signer_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_village_occurred_idx" ON "activity_log" USING btree ("village_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_log_subject_idx" ON "activity_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "announcements_slug_uq" ON "announcements" USING btree ("village_id","slug");--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" USING btree ("village_id","status","publish_at");--> statement-breakpoint
CREATE UNIQUE INDEX "citizen_reports_ticket_uq" ON "citizen_reports" USING btree ("ticket");--> statement-breakpoint
CREATE INDEX "citizen_reports_status_idx" ON "citizen_reports" USING btree ("village_id","status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "families_kk_uq" ON "families" USING btree ("kk_number");--> statement-breakpoint
CREATE INDEX "families_neighborhood_idx" ON "families" USING btree ("neighborhood_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hamlets_village_code_uq" ON "hamlets" USING btree ("village_id","code");--> statement-breakpoint
CREATE INDEX "letter_attachments_request_idx" ON "letter_attachments" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "letter_requests_ticket_uq" ON "letter_requests" USING btree ("ticket");--> statement-breakpoint
CREATE UNIQUE INDEX "letter_requests_verification_code_uq" ON "letter_requests" USING btree ("verification_code");--> statement-breakpoint
CREATE INDEX "letter_requests_status_submitted_idx" ON "letter_requests" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "letter_requests_neighborhood_idx" ON "letter_requests" USING btree ("neighborhood_id");--> statement-breakpoint
CREATE INDEX "letter_requests_nik_idx" ON "letter_requests" USING btree ("applicant_nik");--> statement-breakpoint
CREATE INDEX "letter_requests_name_idx" ON "letter_requests" USING btree ("applicant_name");--> statement-breakpoint
CREATE UNIQUE INDEX "letter_requirements_uq" ON "letter_requirements" USING btree ("letter_type_id","doc_key");--> statement-breakpoint
CREATE UNIQUE INDEX "letter_types_village_code_uq" ON "letter_types" USING btree ("village_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "neighborhoods_hamlet_rt_rw_uq" ON "neighborhoods" USING btree ("hamlet_id","rt","rw");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_staff_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "resident_mutations_resident_idx" ON "resident_mutations" USING btree ("resident_id","effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "residents_nik_uq" ON "residents" USING btree ("nik");--> statement-breakpoint
CREATE INDEX "residents_name_idx" ON "residents" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "residents_village_status_idx" ON "residents" USING btree ("village_id","status");--> statement-breakpoint
CREATE INDEX "residents_neighborhood_idx" ON "residents" USING btree ("neighborhood_id");--> statement-breakpoint
CREATE INDEX "signature_requests_status_idx" ON "signature_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_uq" ON "staff" USING btree ("email");--> statement-breakpoint
CREATE INDEX "staff_village_role_idx" ON "staff" USING btree ("village_id","role");--> statement-breakpoint
CREATE INDEX "staff_shifts_staff_idx" ON "staff_shifts" USING btree ("staff_id","started_at");