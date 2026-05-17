ALTER TABLE "agent_session" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_session" CASCADE;--> statement-breakpoint
ALTER TABLE "environment" DROP CONSTRAINT "environment_name_unique";--> statement-breakpoint
DROP INDEX "idx_agent_config_user_name";--> statement-breakpoint
DROP INDEX "idx_im_channel_user_platform";--> statement-breakpoint
DROP INDEX "idx_knowledge_base_user_slug";--> statement-breakpoint
DROP INDEX "idx_knowledge_base_user_status";--> statement-breakpoint
DROP INDEX "idx_mcp_server_user_name";--> statement-breakpoint
DROP INDEX "idx_provider_user_name";--> statement-breakpoint
DROP INDEX "idx_workflow_user_name";--> statement-breakpoint
DROP INDEX "idx_skill_global";--> statement-breakpoint
DROP INDEX "idx_skill_workspace";--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'user_config'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "user_config" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "agent_config" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "environment" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "im_channel" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "provider" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_task" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_team_id" uuid;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user_config" ADD COLUMN "team_id" uuid PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_config" ADD CONSTRAINT "agent_config_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "im_channel" ADD CONSTRAINT "im_channel_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD CONSTRAINT "mcp_server_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider" ADD CONSTRAINT "provider_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task" ADD CONSTRAINT "scheduled_task_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_team_id_team_id_fk" FOREIGN KEY ("active_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_config" ADD CONSTRAINT "user_config_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_config_team_name" ON "agent_config" USING btree ("team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_environment_team_name" ON "environment" USING btree ("team_id","name");--> statement-breakpoint
CREATE INDEX "idx_im_channel_team_platform" ON "im_channel" USING btree ("team_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_base_team_slug" ON "knowledge_base" USING btree ("team_id","slug");--> statement-breakpoint
CREATE INDEX "idx_knowledge_base_team_status" ON "knowledge_base" USING btree ("team_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mcp_server_team_name" ON "mcp_server" USING btree ("team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_provider_team_name" ON "provider" USING btree ("team_id","name");--> statement-breakpoint
CREATE INDEX "idx_scheduled_task_team_id" ON "scheduled_task" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workflow_team_name" ON "workflow" USING btree ("team_id","name");--> statement-breakpoint
CREATE INDEX "idx_skill_global" ON "skill" USING btree ("team_id","name");--> statement-breakpoint
CREATE INDEX "idx_skill_workspace" ON "skill" USING btree ("team_id","environment_id","name");--> statement-breakpoint
ALTER TABLE "scheduled_task" DROP COLUMN "task";--> statement-breakpoint
ALTER TABLE "scheduled_task" DROP COLUMN "timeout_minutes";