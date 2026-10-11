-- Rich descriptions (ADR 0063). The generated search column is rebuilt with a new expression (a generated column's expression cannot be altered in
-- place), so its index goes with it and is created again; the picture token is dropped and a mention token reduced to the name before indexing.
-- (Hand-written: drizzle-kit emitted an empty expression for the new column.)
DROP INDEX IF EXISTS "issues_search_vector_idx";--> statement-breakpoint
ALTER TABLE "issues" DROP COLUMN "search_vector";--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', regexp_replace(regexp_replace(coalesce(description, ''), '![[][^]]*[]][(]attachment:[0-9a-fA-F-]{36}[)]', ' ', 'g'), '@[[]([^]]*)[]][(]user:[0-9a-fA-F-]{36}[)]', '\1', 'g')), 'B')) STORED;--> statement-breakpoint
CREATE INDEX "issues_search_vector_idx" ON "issues" USING gin ("search_vector");--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "issue_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_project_id_idx" ON "attachments" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_check" CHECK ("attachments"."issue_id" IS NOT NULL OR "attachments"."project_id" IS NOT NULL);
