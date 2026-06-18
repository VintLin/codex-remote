import type { components } from "./generated/openapi";

export type DeviceConnectionStatus = components["schemas"]["DeviceConnectionStatus"];
export type ConversationStatus = components["schemas"]["ConversationStatus"];
export type TaskStatus = components["schemas"]["TaskStatus"];
export type DiffKind = components["schemas"]["DiffKind"];

export type Device = components["schemas"]["Device"];
export type RemoteProject = components["schemas"]["RemoteProject"];
export type CodexConversation = components["schemas"]["CodexConversation"];
export type BoardTask = components["schemas"]["BoardTask"];
export type DiffLine = components["schemas"]["DiffLine"];
export type ConversationInputItem = components["schemas"]["ConversationInputItem"];
export type FollowUpInput = components["schemas"]["FollowUpInput"];
export type CommandAccepted = components["schemas"]["CommandAccepted"];
export type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];

export type SidebarProject = RemoteProject;
export type Conversation = CodexConversation;
