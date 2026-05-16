import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import { eventService } from "../../services/event-service";
import {
  SessionHistorySchema,
} from "../../schemas/session.schema";

const app = new Elysia({ name: "web-sessions", prefix: "/web" })
  .use(authGuardPlugin)
  .model({
    "session-history": SessionHistorySchema,
  });

/** GET /web/sessions/:id/history — Session event history (EventBus)
 *  Session 元数据已下沉到 Agent，此处仅保留事件流查询 */
app.get("/sessions/:id/history", async ({ params, error }) => {
  const sessionId = params.id;
  const bus = eventService.getBus(sessionId);
  if (!bus) {
    return error(404, { error: { type: "not_found", message: "Session event bus not found" } });
  }
  const events = bus.getEventsSince(0);
  return { events };
}, { sessionAuth: true });

export default app;
