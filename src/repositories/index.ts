export type { ChannelBindingInsert, ChannelBindingRow, IChannelBindingRepo } from "./channel-binding";
export { channelBindingRepo } from "./channel-binding";
export type {
  EnvironmentCreateParams,
  EnvironmentRecord,
  EnvironmentUpdateParams,
  IEnvironmentRepo,
} from "./environment";
export { environmentRepo } from "./environment";
export type {
  AgentKnowledgeBindingRow,
  IAgentKnowledgeBindingRepo,
  IKnowledgeBaseRepo,
  IKnowledgeResourceRepo,
  KnowledgeBaseRow,
  KnowledgeResourceRow,
} from "./knowledge-base";
export { agentKnowledgeBindingRepo, knowledgeBaseRepo, knowledgeResourceRepo } from "./knowledge-base";
export type { ISessionRepo, SessionCreateParams, SessionRecord } from "./session";
export { sessionRepo } from "./session";
export type { ISessionWorkerRepo, SessionWorkerRecord } from "./session-worker";
export { sessionWorkerRepo } from "./session-worker";
export type { IShareLinkRepo } from "./share-link";
export { shareLinkRepo } from "./share-link";
export type { IScheduledTaskRepo, ITaskExecutionLogRepo, ScheduledTaskRow, TaskExecutionLogRow } from "./task";
export { scheduledTaskRepo, taskExecutionLogRepo } from "./task";
export type { ITokenRepo, TokenRecord } from "./token";
export { tokenRepo } from "./token";
export type { IWorkItemRepo, WorkItemRecord } from "./work-item";
export { workItemRepo } from "./work-item";
export type { WorkflowDefRow, WorkflowVersionRow, AuthCtx as WorkflowAuthCtx } from "./workflow-def";
export {
  createWorkflowDef,
  saveDraft,
  publishVersion,
  listWorkflowDefs,
  getWorkflowDef,
  getVersions,
  getVersionYaml,
  setLatestVersion,
  deleteWorkflowDef,
  updateWorkflowMeta,
  listRecoverableWorkflows,
  recoverWorkflows,
  restoreVersionToDraft,
} from "./workflow-def";

import { sessionRepo } from "./session";
import { sessionWorkerRepo } from "./session-worker";
import { tokenRepo } from "./token";
import { workItemRepo } from "./work-item";

/** 重置所有内存仓储（仅用于测试） */
export function resetAllRepos(): void {
  sessionRepo.reset();
  tokenRepo.reset();
  workItemRepo.reset();
  sessionWorkerRepo.reset();
}
