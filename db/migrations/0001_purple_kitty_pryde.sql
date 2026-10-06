CREATE TYPE "public"."session_actor" AS ENUM('STAFF', 'RESIDENT');--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'KELUAR_LOG';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'AKTIVASI_TTD';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'KEAMANAN_AKUN';--> statement-breakpoint
CREATE TABLE "resident_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"nik" varchar(16) NOT NULL,
	"password_hash" varchar(200) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"actor_type" "session_actor" NOT NULL,
	"actor_id" uuid NOT NULL,
	"user_agent" varchar(200),
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "password_hash" varchar(200);--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "login_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "sign_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "sign_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resident_accounts" ADD CONSTRAINT "resident_accounts_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_accounts" ADD CONSTRAINT "resident_accounts_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resident_accounts_resident_uq" ON "resident_accounts" USING btree ("resident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resident_accounts_nik_uq" ON "resident_accounts" USING btree ("nik");--> statement-breakpoint
CREATE INDEX "resident_accounts_village_idx" ON "resident_accounts" USING btree ("village_id");--> statement-breakpoint
CREATE INDEX "sessions_actor_idx" ON "sessions" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");