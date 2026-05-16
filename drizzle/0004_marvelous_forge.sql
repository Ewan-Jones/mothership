CREATE TABLE "im_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"platform" varchar NOT NULL,
	"credentials" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'disconnected' NOT NULL,
	"last_error" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "im_channel_route" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"chat_id" varchar,
	"environment_id" varchar NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "im_channel" ADD CONSTRAINT "im_channel_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "im_channel_route" ADD CONSTRAINT "im_channel_route_channel_id_im_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."im_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "im_channel_route" ADD CONSTRAINT "im_channel_route_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_im_channel_user_platform" ON "im_channel" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "idx_im_channel_route_channel" ON "im_channel_route" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_im_channel_route_chat" ON "im_channel_route" USING btree ("channel_id","chat_id");