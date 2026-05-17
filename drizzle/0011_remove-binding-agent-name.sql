DROP INDEX "idx_agent_knowledge_binding_agent";--> statement-breakpoint
DROP INDEX "idx_agent_knowledge_binding_agent_kb";--> statement-breakpoint
ALTER TABLE "agent_knowledge_binding" ALTER COLUMN "agent_config_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_knowledge_binding" DROP COLUMN "agent_name";