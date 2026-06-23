"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { AssistantThreadSnapshot, DetailTarget, LinkReference } from "../../domain/assistant/assistantTimeline";
import { createFallbackWorkbenchData, loadWorkbenchData } from "../../data/workerApi/workbenchData";
import { WorkerApiClient, WorkerApiRequestError } from "../../data/workerApi/client";
import {
  createConnectionEntryModel,
  resolveConnectionEntryDevices,
  resolveInitialSelectedDeviceId,
  shouldPersistSelectedDeviceId,
} from "../../domain/connection/connectionEntry";
import type { BoardTask, ConversationQueuedMessage, Device, PendingApproval, ProjectSearchResult, TaskConversationLink } from "@codex-remote/api-contract";
import { getDictionary } from "../../i18n/dictionary";
import type { Locale } from "../../i18n/locales";
import { LOCALE_STORAGE_KEY } from "../../i18n/storageKey";
import { createConversationKey, findConversationByKey } from "../../domain/sidebar/conversationIdentity";
import {
  createDefaultSidebarSectionState,
  createProjectKey,
  createSidebarModel,
  resolveConversationNavigator,
  toggleSidebarSection,
} from "../../domain/sidebar/sidebarModel";
import { submitConversationFollowUp, type FollowUpSubmitStatus } from "./followUpSubmitController";
import {
  submitStartConversation,
  type StartConversationSubmitStatus,
} from "./startConversationSubmitController";
import {
  submitApprovalDecision,
  submitInterrupt,
  submitSteer,
  type ControlSubmitStatus,
} from "./controlSubmitController";
import { ConnectionEntry } from "./connection-entry";
import { ResizableWorkspaceShell } from "./resizable-workspace-shell";
import {
  ConversationDetailPane,
  ConversationMain,
  DeviceDetailPane,
  DevicesPage,
  LocalWorkbenchPage,
  SearchDialog,
  SettingsPage,
  TaskBoardPage,
  TaskDetailPane,
} from "../detail/main-panels";
import { type AppView, Sidebar, type SidebarPressedItem } from "../sidebar/sidebar";

type SidebarFocusTarget = { kind: "project" | "conversation"; id: string } | null;
type MobileWorkspacePane = "detail" | "main" | "sidebar";
const controlPlaneBaseUrl =
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:8786";
const controlPlaneToken =
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "example-token");
const selectedDeviceStorageKey = "codex-remote:selected-device-id";
function createUnavailableDevice(disconnectedName: string): Device {
  return {
    id: "",
    icon: "laptop",
    name: disconnectedName,
    status: "Not connected",
    ip: "unavailable",
    lastOnlineAt: "",
    currentProject: "",
    model: "",
  };
}

function readStoredSelectedDeviceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(selectedDeviceStorageKey);
  } catch {
    return null;
  }
}

function writeStoredSelectedDeviceId(deviceId: string): void {
  try {
    window.localStorage.setItem(selectedDeviceStorageKey, deviceId);
  } catch {
    // Ignore storage failures; the in-memory selection still drives this session.
  }
}

interface CodexRemoteAppProps {
  locale: Locale;
}

export function CodexRemoteApp({ locale }: CodexRemoteAppProps) {
  const dictionary = getDictionary(locale);
  const [workbenchData, setWorkbenchData] = useState(() => createFallbackWorkbenchData("not_configured"));
  const [activeView, setActiveView] = useState<AppView>("conversation");
  const [isWorkbenchLoading, setIsWorkbenchLoading] = useState(true);
  const [hasCompletedConnectionSteps, setHasCompletedConnectionSteps] = useState(false);
  const [cachedConnectionDevices, setCachedConnectionDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => resolveInitialSelectedDeviceId(null, workbenchData.devices[0]?.id ?? null));
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(
    () => workbenchData.conversations[0] ? createConversationKey(workbenchData.conversations[0]) : null,
  );
  const [expandedProjectIds, setExpandedProjectIds] = useState(
    () => new Set(workbenchData.projects.filter((project) => project.expanded).map((project) => createProjectKey(project))),
  );
  const [sectionState, setSectionState] = useState(createDefaultSidebarSectionState);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobileWorkspacePane>("sidebar");
  const [pressedItem, setPressedItem] = useState<SidebarPressedItem>(null);
  const [focusTarget, setFocusTarget] = useState<SidebarFocusTarget>(null);
  const router = useRouter();
  const pathname = usePathname();
  const handleLocaleChange = useCallback((nextLocale: Locale) => {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    } catch {
      // Ignore storage failures; the URL navigation still drives the current session.
    }
    const segments = (pathname ?? "").split("/");
    if (segments.length > 1) {
      segments[1] = nextLocale;
    }
    const target = segments.join("/") || `/${nextLocale}`;
    router.push(target);
  }, [pathname, router]);
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpSubmitStatus>("idle");
  const [startStatus, setStartStatus] = useState<StartConversationSubmitStatus>("idle");
  const [controlStatus, setControlStatus] = useState<ControlSubmitStatus>("idle");
  const [taskStatus, setTaskStatus] = useState<"failed" | "idle" | "submitting">("idle");
  const [reviewStartStatus, setReviewStartStatus] = useState<"accepted" | "failed" | "idle" | "submitting">("idle");
  const [reviewStartError, setReviewStartError] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [selectedDetailTarget, setSelectedDetailTarget] = useState<DetailTarget | LinkReference | null>(null);
  const [renamingConversationKey, setRenamingConversationKey] = useState<string | null>(null);
  const pressedTimerRef = useRef<number | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const { devices, projects, conversations, approvalCards, queuedMessages, tasks, localWorkbench, runtimeSettings, advancedPlatform, assistantThreads, searchRecents, source, taskSource } = workbenchData;
  const device = devices.find((deviceItem) => deviceItem.id === selectedDeviceId) ?? devices[0] ?? createUnavailableDevice(dictionary.app.disconnectedDeviceName);
  const selectedConversation = findConversationByKey(conversations, selectedConversationKey);
  const conversation =
    selectedConversation?.deviceId === selectedDeviceId
      ? selectedConversation
      : conversations.find((conversationItem) => conversationItem.deviceId === selectedDeviceId) ?? null;
  const assistantThread = conversation
    ? assistantThreads.find((thread) => thread.id === conversation.id && thread.deviceId === conversation.deviceId) ?? null
    : null;
  const sidebarModel = useMemo(
    () => createSidebarModel({ conversations, expandedProjectIds, projects }),
    [expandedProjectIds, conversations, projects],
  );
  const selectedProject = projects.find((project) => project.deviceId === selectedDeviceId) ?? null;
  const conversationNavigator = useMemo(
    () =>
      selectedConversationKey
        ? resolveConversationNavigator(sidebarModel, selectedConversationKey)
        : { nextConversationKey: null, previousConversationKey: null },
    [selectedConversationKey, sidebarModel],
  );
  const canSubmitFollowUp =
    source.reason === "loaded" && conversation !== null && conversation.loaded === true && Boolean(controlPlaneToken);
  const canStartConversation = source.reason === "loaded" && Boolean(controlPlaneToken) && selectedProject !== null;
  const canStartReview = source.reason === "loaded" && Boolean(controlPlaneToken) && selectedProject !== null && conversation !== null;
  const activeTurnId = getActiveTurnId(assistantThread);
  const workerClient = useMemo(() => new WorkerApiClient({
    baseUrl: controlPlaneBaseUrl,
    token: controlPlaneToken,
  }), []);

  const refreshWorkbenchData = useCallback(async (conversationKey: string | null) => {
    setIsWorkbenchLoading(true);
    try {
      const nextWorkbenchData = await loadWorkbenchData({
        baseUrl: controlPlaneBaseUrl,
        token: controlPlaneToken,
        selectedConversationKey: conversationKey,
        selectedDeviceId,
      });
      setWorkbenchData(nextWorkbenchData);
    } finally {
      setIsWorkbenchLoading(false);
    }
  }, [selectedDeviceId]);

  const refreshApprovals = useCallback(async (conversationKey: string | null) => {
    const approvalConversation = findConversationByKey(conversations, conversationKey);
    if (!approvalConversation || source.reason !== "loaded" || !controlPlaneToken) {
      setPendingApprovals([]);
      return;
    }

    try {
      const approvals = await new WorkerApiClient({
        baseUrl: controlPlaneBaseUrl,
        token: controlPlaneToken,
      }).listApprovals(approvalConversation.deviceId, approvalConversation.id);
      setPendingApprovals(approvals);
    } catch {
      setPendingApprovals([]);
    }
  }, [conversations, source.reason]);

  const submitFollowUp = useCallback(async (message: string) => {
    return submitConversationFollowUp({
      conversationId: conversation?.id ?? null,
      createClientRequestId: () => crypto.randomUUID(),
      deviceId: conversation?.deviceId ?? null,
      message,
      refreshWorkbenchData: async () => refreshWorkbenchData(conversation ? createConversationKey(conversation) : null),
      setFollowUpStatus,
      workerClient: new WorkerApiClient({
        baseUrl: controlPlaneBaseUrl,
        token: controlPlaneToken,
      }),
    });
  }, [conversation, refreshWorkbenchData]);

  const queueConversationMessage = useCallback(async (message: string) => {
    if (!conversation || source.reason !== "loaded" || !controlPlaneToken) {
      setFollowUpStatus("failed");
      return "failed" as const;
    }

    setFollowUpStatus("submitting");
    try {
      await workerClient.queueConversationMessage(conversation.deviceId, conversation.id, {
        message,
        clientRequestId: crypto.randomUUID(),
      });
      await refreshWorkbenchData(createConversationKey(conversation));
      setFollowUpStatus("accepted");
      return "accepted" as const;
    } catch {
      setFollowUpStatus("failed");
      return "failed" as const;
    }
  }, [conversation, refreshWorkbenchData, source.reason, workerClient]);

  const sendQueuedConversationMessage = useCallback(async (message: ConversationQueuedMessage) => {
    if (!conversation || source.reason !== "loaded" || !controlPlaneToken) {
      setFollowUpStatus("failed");
      return;
    }

    setFollowUpStatus("submitting");
    try {
      await workerClient.sendQueuedMessage(conversation.deviceId, conversation.id, message.id, {
        clientRequestId: crypto.randomUUID(),
        expectedQueuedMessageId: message.id,
      });
      await refreshWorkbenchData(createConversationKey(conversation));
      setFollowUpStatus("accepted");
    } catch {
      setFollowUpStatus("failed");
      await refreshWorkbenchData(createConversationKey(conversation));
    }
  }, [conversation, refreshWorkbenchData, source.reason, workerClient]);

  const cancelQueuedConversationMessage = useCallback(async (message: ConversationQueuedMessage) => {
    if (!conversation || source.reason !== "loaded" || !controlPlaneToken) {
      setControlStatus("failed");
      return;
    }

    setControlStatus("submitting");
    try {
      await workerClient.cancelQueuedMessage(conversation.deviceId, conversation.id, message.id);
      await refreshWorkbenchData(createConversationKey(conversation));
      setControlStatus("accepted");
    } catch {
      setControlStatus("failed");
    }
  }, [conversation, refreshWorkbenchData, source.reason, workerClient]);

  const submitStart = useCallback(async (message: string) => submitStartConversation({
    createClientRequestId: () => crypto.randomUUID(),
    deviceId: selectedProject?.deviceId ?? null,
    message,
    projectId: selectedProject?.id ?? null,
    refreshWorkbenchData,
    setStatus: setStartStatus,
    workerClient,
  }), [refreshWorkbenchData, selectedProject?.deviceId, selectedProject?.id, workerClient]);

  const submitInterruptControl = useCallback(async () => {
    await submitInterrupt({
      conversationId: conversation?.id ?? null,
      createClientRequestId: () => crypto.randomUUID(),
      deviceId: conversation?.deviceId ?? null,
      refreshWorkbenchData: async () => {
        const conversationKey = conversation ? createConversationKey(conversation) : null;
        await refreshWorkbenchData(conversationKey);
        await refreshApprovals(conversationKey);
      },
      setStatus: setControlStatus,
      turnId: activeTurnId,
      workerClient,
    });
  }, [activeTurnId, conversation?.deviceId, conversation?.id, refreshApprovals, refreshWorkbenchData, workerClient]);

  const submitSteerControl = useCallback(async (message: string) => submitSteer({
    conversationId: conversation?.id ?? null,
    createClientRequestId: () => crypto.randomUUID(),
    deviceId: conversation?.deviceId ?? null,
    message,
    refreshWorkbenchData: async () => {
      const conversationKey = conversation ? createConversationKey(conversation) : null;
      await refreshWorkbenchData(conversationKey);
      await refreshApprovals(conversationKey);
    },
    setStatus: setControlStatus,
    turnId: activeTurnId,
    workerClient,
  }), [activeTurnId, conversation?.deviceId, conversation?.id, refreshApprovals, refreshWorkbenchData, workerClient]);

  const submitApprovalControl = useCallback(async (approval: PendingApproval, decision: "accept" | "decline" | "cancel") => {
    await submitApprovalDecision({
      approval,
      conversationId: conversation?.id ?? null,
      createClientRequestId: () => crypto.randomUUID(),
      decision,
      deviceId: conversation?.deviceId ?? null,
      refreshWorkbenchData: async () => {
        const conversationKey = conversation ? createConversationKey(conversation) : null;
        await refreshWorkbenchData(conversationKey);
        await refreshApprovals(conversationKey);
      },
      setStatus: setControlStatus,
      workerClient,
    });
  }, [conversation?.deviceId, conversation?.id, refreshApprovals, refreshWorkbenchData, workerClient]);

  const createTask = useCallback(async (taskTitle: string) => {
    if (!controlPlaneToken) {
      setTaskStatus("failed");
      return;
    }

    setTaskStatus("submitting");
    try {
      await workerClient.createTask({ title: taskTitle, clientRequestId: crypto.randomUUID() });
      await refreshWorkbenchData(conversation ? createConversationKey(conversation) : selectedConversationKey);
      setTaskStatus("idle");
    } catch {
      setTaskStatus("failed");
    }
  }, [conversation, refreshWorkbenchData, selectedConversationKey, workerClient]);

  const linkSelectedConversationToTask = useCallback(async (task: BoardTask) => {
    if (!conversation?.projectId || !controlPlaneToken) {
      setTaskStatus("failed");
      return;
    }

    setTaskStatus("submitting");
    try {
      await workerClient.linkTaskConversation(task.id, {
        deviceId: conversation.deviceId,
        conversationId: conversation.id,
        projectId: conversation.projectId,
      });
      await refreshWorkbenchData(createConversationKey(conversation));
      setTaskStatus("idle");
    } catch {
      setTaskStatus("failed");
    }
  }, [conversation, refreshWorkbenchData, workerClient]);

  const unlinkConversationFromTask = useCallback(async (task: BoardTask, link: TaskConversationLink) => {
    if (!controlPlaneToken) {
      setTaskStatus("failed");
      return;
    }

    setTaskStatus("submitting");
    try {
      await workerClient.unlinkTaskConversation(task.id, link.deviceId, link.conversationId);
      await refreshWorkbenchData(conversation ? createConversationKey(conversation) : selectedConversationKey);
      setTaskStatus("idle");
    } catch {
      setTaskStatus("failed");
    }
  }, [conversation, refreshWorkbenchData, selectedConversationKey, workerClient]);

  const searchLocalFiles = useCallback(async (query: string): Promise<ProjectSearchResult | null> => {
    if (!localWorkbench.deviceId || !localWorkbench.projectId || source.reason !== "loaded" || !controlPlaneToken) {
      return null;
    }

    try {
      const result = await workerClient.searchLocalWorkbenchFiles(localWorkbench.deviceId, localWorkbench.projectId, {
        query,
        limit: 20,
      });
      setWorkbenchData((current) => ({
        ...current,
        localWorkbench: {
          ...current.localWorkbench,
          search: {
            data: result,
            status: "loaded",
          },
        },
      }));
      return result;
    } catch {
      setWorkbenchData((current) => ({
        ...current,
        localWorkbench: {
          ...current.localWorkbench,
          status: current.localWorkbench.status === "loaded" ? "degraded" : current.localWorkbench.status,
          search: {
            data: current.localWorkbench.search.data,
            error: {
              code: "request_failure",
              message: "Worker request failed.",
            },
            status: "failed",
          },
        },
      }));
      return null;
    }
  }, [localWorkbench.deviceId, localWorkbench.projectId, source.reason, workerClient]);

  const submitReviewStart = useCallback(async (confirmationText: string) => {
    if (!conversation || !selectedProject || source.reason !== "loaded" || !controlPlaneToken) {
      setReviewStartStatus("failed");
      setReviewStartError("Missing selected device, project, or conversation.");
      return;
    }

    setReviewStartStatus("submitting");
    setReviewStartError(null);
    try {
      await workerClient.startReview(conversation.deviceId, conversation.id, {
        projectId: selectedProject.id,
        expectedConversationId: conversation.id,
        clientRequestId: crypto.randomUUID(),
        confirmationText,
      });
      await refreshWorkbenchData(createConversationKey(conversation));
      setReviewStartStatus("accepted");
    } catch (error) {
      setReviewStartStatus("failed");
      setReviewStartError(error instanceof WorkerApiRequestError ? error.envelope.message : "Worker request failed.");
      await refreshWorkbenchData(createConversationKey(conversation));
    }
  }, [conversation, refreshWorkbenchData, selectedProject, source.reason, workerClient]);

  const openConversation = useCallback(async (conversationKey: string) => {
    const targetConversation = findConversationByKey(conversations, conversationKey);
    if (!targetConversation || source.reason !== "loaded" || !controlPlaneToken) {
      return;
    }

    try {
      await workerClient.openConversation(targetConversation.deviceId, targetConversation.id, {
        clientRequestId: crypto.randomUUID(),
      });
      await refreshWorkbenchData(conversationKey);
    } catch {
      setControlStatus("failed");
    }
  }, [conversations, refreshWorkbenchData, source.reason, workerClient]);

  const renameConversation = useCallback(async (targetConversation: { deviceId: string; id: string; title: string }, title: string) => {
    if (source.reason !== "loaded" || !controlPlaneToken) {
      setControlStatus("failed");
      return;
    }
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }

    setControlStatus("submitting");
    try {
      await workerClient.renameConversation(targetConversation.deviceId, targetConversation.id, {
        title: nextTitle,
        clientRequestId: crypto.randomUUID(),
      });
      await refreshWorkbenchData(createConversationKey(targetConversation));
      setControlStatus("accepted");
      setRenamingConversationKey(null);
    } catch {
      setControlStatus("failed");
    }
  }, [refreshWorkbenchData, source.reason, workerClient]);

  const archiveConversation = useCallback(async (targetConversation: { deviceId: string; id: string }) => {
    if (source.reason !== "loaded" || !controlPlaneToken) {
      setControlStatus("failed");
      return;
    }

    setControlStatus("submitting");
    try {
      await workerClient.archiveConversation(targetConversation.deviceId, targetConversation.id, {
        clientRequestId: crypto.randomUUID(),
      });
      await refreshWorkbenchData(createConversationKey(targetConversation));
      setControlStatus("accepted");
    } catch {
      setControlStatus("failed");
    }
  }, [refreshWorkbenchData, source.reason, workerClient]);

  const unarchiveConversation = useCallback(async (targetConversation: { deviceId: string; id: string }) => {
    if (source.reason !== "loaded" || !controlPlaneToken) {
      setControlStatus("failed");
      return;
    }

    setControlStatus("submitting");
    try {
      await workerClient.unarchiveConversation(targetConversation.deviceId, targetConversation.id, {
        clientRequestId: crypto.randomUUID(),
      });
      await refreshWorkbenchData(createConversationKey(targetConversation));
      setControlStatus("accepted");
    } catch {
      setControlStatus("failed");
    }
  }, [refreshWorkbenchData, source.reason, workerClient]);

  const beginRenameConversationByKey = useCallback((conversationKey: string) => {
    const targetConversation = findConversationByKey(conversations, conversationKey);
    if (targetConversation) {
      setSelectedConversationKey(conversationKey);
      setActiveView("conversation");
      setRenamingConversationKey(conversationKey);
    }
  }, [conversations]);

  const archiveConversationByKey = useCallback(async (conversationKey: string) => {
    const targetConversation = findConversationByKey(conversations, conversationKey);
    if (targetConversation) {
      await archiveConversation(targetConversation);
    }
  }, [archiveConversation, conversations]);

  const restoreConversationByKey = useCallback(async (conversationKey: string) => {
    const targetConversation = findConversationByKey(conversations, conversationKey);
    if (targetConversation) {
      await unarchiveConversation(targetConversation);
    }
  }, [conversations, unarchiveConversation]);

  useEffect(() => {
    let shouldIgnore = false;
    void (async () => {
      setIsWorkbenchLoading(true);
      const nextWorkbenchData = await loadWorkbenchData({
        baseUrl: controlPlaneBaseUrl,
        token: controlPlaneToken,
        selectedConversationKey,
        selectedDeviceId,
      });
      if (!shouldIgnore) {
        setWorkbenchData(nextWorkbenchData);
        setIsWorkbenchLoading(false);
      }
    })();

    return () => {
      shouldIgnore = true;
    };
  }, [selectedConversationKey, selectedDeviceId]);

  useEffect(() => {
    setHasCompletedConnectionSteps(false);
  }, [selectedDeviceId]);

  useEffect(() => {
    if (source.reason !== "loaded" || hasCompletedConnectionSteps) {
      return;
    }
    const timerId = window.setTimeout(() => setHasCompletedConnectionSteps(true), 700);
    return () => window.clearTimeout(timerId);
  }, [hasCompletedConnectionSteps, isWorkbenchLoading, source.reason]);

  useEffect(() => {
    const storedDeviceId = readStoredSelectedDeviceId();
    if (storedDeviceId) {
      setSelectedDeviceId((currentDeviceId) => currentDeviceId || storedDeviceId);
    }
  }, []);

  useEffect(() => {
    let shouldIgnore = false;
    void workerClient.listDevices().then((nextDevices) => {
      if (shouldIgnore) {
        return;
      }
      setCachedConnectionDevices(nextDevices);
      setSelectedDeviceId((currentDeviceId) => currentDeviceId || nextDevices[0]?.id || "");
    }).catch(() => {});

    return () => {
      shouldIgnore = true;
    };
  }, [workerClient]);

  useEffect(() => {
    if (devices.length) {
      setCachedConnectionDevices(devices);
    }
  }, [devices]);

  useEffect(() => {
    if (shouldPersistSelectedDeviceId(selectedDeviceId)) {
      writeStoredSelectedDeviceId(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    void refreshApprovals(conversation ? createConversationKey(conversation) : null);
  }, [conversation, refreshApprovals]);

  useEffect(() => {
    if (selectedDeviceId === "" || !devices.some((deviceItem) => deviceItem.id === selectedDeviceId)) {
      const fallbackDevice = devices[0];
      if (fallbackDevice) {
        setSelectedDeviceId(fallbackDevice.id);
      }
      return;
    }

    if (!devices.length) {
      setSelectedConversationKey(null);
      return;
    }

    const selectedConversation = findConversationByKey(conversations, selectedConversationKey);
    const fallbackConversation =
      selectedConversation?.deviceId === selectedDeviceId
        ? selectedConversation
        : conversations.find((conversationItem) => conversationItem.deviceId === selectedDeviceId) ?? null;

    if (fallbackConversation && createConversationKey(fallbackConversation) !== selectedConversationKey) {
      setSelectedConversationKey(createConversationKey(fallbackConversation));
    }

    if (!fallbackConversation) {
      setSelectedConversationKey(null);
    }

  }, [conversations, devices, selectedConversationKey, selectedDeviceId]);

  useEffect(() => {
    return () => {
      if (pressedTimerRef.current !== null) {
        window.clearTimeout(pressedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!focusTarget) {
      return;
    }
    document.querySelector<HTMLElement>(getSidebarInteractionSelector(focusTarget))?.focus({ preventScroll: true });
  }, [focusTarget, selectedConversationKey, expandedProjectIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSearchOpen]);

  useEffect(() => {
    setSelectedDetailTarget(null);
    setFollowUpStatus("idle");
    setStartStatus("idle");
    setControlStatus("idle");
    setTaskStatus("idle");
    setReviewStartStatus("idle");
    setReviewStartError(null);
  }, [selectedConversationKey]);

  useEffect(() => {
    setStartStatus("idle");
  }, [selectedDeviceId, selectedProject?.id]);

  useEffect(() => {
    setReviewStartStatus("idle");
    setReviewStartError(null);
  }, [selectedConversationKey, selectedDeviceId, selectedProject?.id]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      const nextIsMobile = mediaQuery.matches;
      setIsMobileViewport(nextIsMobile);
      if (!nextIsMobile) {
        setMobilePane("sidebar");
      }
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const pressSidebarItem = (nextPressedItem: Exclude<SidebarPressedItem, null>, options: { restoreFocus?: boolean } = {}) => {
    setPressedItem(nextPressedItem);
    setFocusTarget(options.restoreFocus === false ? null : nextPressedItem);
    if (pressedTimerRef.current !== null) {
      window.clearTimeout(pressedTimerRef.current);
    }
    pressedTimerRef.current = window.setTimeout(() => {
      setPressedItem((current) =>
        current?.kind === nextPressedItem.kind && current.id === nextPressedItem.id ? null : current,
      );
      pressedTimerRef.current = null;
    }, 500);
  };

  const selectView = (view: AppView) => {
    setActiveView(view);
    if (isMobileViewport) {
      setMobilePane("main");
    }
  };

  const selectDevice = (nextDeviceId: string) => {
    setSelectedDeviceId(nextDeviceId);
    const nextConversation = conversations.find((conversationItem) => conversationItem.deviceId === nextDeviceId);
    setSelectedConversationKey(nextConversation ? createConversationKey(nextConversation) : null);
  };

  const toggleProject = (projectKey: string, options: { restoreFocus?: boolean } = {}) => {
    pressSidebarItem({ kind: "project", id: projectKey }, options);
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectKey)) {
        next.delete(projectKey);
      } else {
        next.add(projectKey);
      }
      return next;
    });
  };

  const selectConversation = (conversationKey: string) => {
    pressSidebarItem({ kind: "conversation", id: conversationKey });
    setSelectedConversationKey(conversationKey);
    setActiveView("conversation");
    if (isMobileViewport) {
      setMobilePane("main");
    }
    void openConversation(conversationKey);
  };

  const toggleSection = (sectionId: Parameters<typeof toggleSidebarSection>[1]) => {
    setSectionState((current) => toggleSidebarSection(current, sectionId));
  };

  const mainContent = (() => {
    if (activeView === "devices") {
      return {
        detail: (
          <DeviceDetailPane
            copy={dictionary.mainPanels}
            detailCopy={dictionary.detail}
            isCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            onBack={() => setMobilePane("main")}
            onCollapse={() => setIsDetailCollapsed(true)}
            selectedDeviceId={selectedDeviceId}
            devices={devices}
          />
        ),
        main: (
          <DevicesPage
            copy={dictionary.mainPanels}
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            onBack={() => setMobilePane("sidebar")}
            onExpandDetail={() => setIsDetailCollapsed(false)}
            onExpandSidebar={() => setIsSidebarCollapsed(false)}
            onOpenDetail={() => {
              if (isMobileViewport) {
                setMobilePane("detail");
              }
            }}
            onSelectDevice={selectDevice}
            selectedDeviceId={selectedDeviceId}
            devices={devices}
          />
        ),
      };
    }

    if (activeView === "tasks") {
      return {
        detail: (
          <TaskDetailPane
            copy={dictionary.mainPanels}
            detailCopy={dictionary.detail}
            isCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            onBack={() => setMobilePane("main")}
            onCollapse={() => setIsDetailCollapsed(true)}
          />
        ),
        main: (
          <TaskBoardPage
            conversations={conversations}
            copy={dictionary.mainPanels}
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            onBack={() => setMobilePane("sidebar")}
            onCreateTask={createTask}
            onExpandDetail={() => setIsDetailCollapsed(false)}
            onExpandSidebar={() => setIsSidebarCollapsed(false)}
            onLinkSelectedConversation={linkSelectedConversationToTask}
            onUnlinkConversation={unlinkConversationFromTask}
            selectedConversation={conversation}
            source={source}
            taskLoadState={taskSource.status}
            taskStatus={taskStatus}
            tasks={tasks}
          />
        ),
      };
    }

    if (activeView === "localTools") {
      return {
        detail: (
          <ConversationDetailPane
            conversationTitle={dictionary.app.conversationTitle}
            detailCopy={dictionary.detail}
            isCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            onBack={() => setMobilePane("main")}
            onCollapse={() => setIsDetailCollapsed(true)}
            target={selectedDetailTarget}
          />
        ),
        main: (
          <LocalWorkbenchPage
            canStartReview={canStartReview}
            copy={dictionary.mainPanels}
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            localWorkbench={localWorkbench}
            onBack={() => setMobilePane("sidebar")}
            onExpandDetail={() => setIsDetailCollapsed(false)}
            onExpandSidebar={() => setIsSidebarCollapsed(false)}
            onSubmitReviewStart={submitReviewStart}
            onSearchLocalFiles={searchLocalFiles}
            reviewStartError={reviewStartError}
            reviewStartStatus={reviewStartStatus}
            source={source}
          />
        ),
      };
    }

    if (activeView === "settings") {
      return {
        detail: (
          <ConversationDetailPane
            conversationTitle={dictionary.app.settingsTitle}
            detailCopy={dictionary.detail}
            isCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            onBack={() => setMobilePane("main")}
            onCollapse={() => setIsDetailCollapsed(true)}
            target={selectedDetailTarget}
          />
        ),
        main: (
          <SettingsPage
            advancedPlatform={advancedPlatform}
            conversations={conversations}
            copy={{ detail: dictionary.detail, mainPanels: dictionary.mainPanels, settings: dictionary.settings, status: dictionary.status }}
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            locale={locale}
            onBack={() => setMobilePane("sidebar")}
            onExpandDetail={() => setIsDetailCollapsed(false)}
            onExpandSidebar={() => setIsSidebarCollapsed(false)}
            onLocaleChange={handleLocaleChange}
            onRestoreConversation={unarchiveConversation}
            runtimeSettings={runtimeSettings}
          />
        ),
      };
    }

    if (conversation === null) {
      return {
        detail: (
          <ConversationDetailPane
            conversationTitle={dictionary.app.conversationTitle}
            detailCopy={dictionary.detail}
            isCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            onBack={() => setMobilePane("main")}
            onCollapse={() => setIsDetailCollapsed(true)}
            target={selectedDetailTarget}
          />
        ),
        main: (
          <ConversationMain
            actionsCopy={dictionary.actions}
            assistantThread={null}
            canStartConversation={canStartConversation}
            canSubmitFollowUp={false}
            activeTurnId={null}
            controlStatus={controlStatus}
            conversation={null}
            conversationCopy={dictionary.conversation}
            copy={dictionary.mainPanels}
            detailCopy={dictionary.detail}
            followUpStatus={followUpStatus}
            isDetailCollapsed={isDetailCollapsed}
            isMobile={isMobileViewport}
            isSidebarCollapsed={isSidebarCollapsed}
            nextConversationKey={conversationNavigator.nextConversationKey}
            onBack={() => setMobilePane("sidebar")}
            onExpandDetail={() => setIsDetailCollapsed(false)}
            onExpandSidebar={() => setIsSidebarCollapsed(false)}
            onOpenDetail={(target) => {
              setSelectedDetailTarget(target);
              if (isMobileViewport) {
                setMobilePane("detail");
              }
            }}
            onSelectAdjacentConversation={selectConversation}
            onArchiveConversation={archiveConversation}
            onCancelQueuedMessage={cancelQueuedConversationMessage}
            onBeginRenameConversation={() => {
              if (conversation) {
                setRenamingConversationKey(createConversationKey(conversation));
              }
            }}
            onCancelRenameConversation={() => setRenamingConversationKey(null)}
            onQueueMessage={queueConversationMessage}
            onRenameConversation={renameConversation}
            onRestoreConversation={unarchiveConversation}
            onSendQueuedMessage={sendQueuedConversationMessage}
            onSubmitApprovalDecision={submitApprovalControl}
            onSubmitFollowUp={submitFollowUp}
            onSubmitInterrupt={submitInterruptControl}
            onSubmitStart={submitStart}
            onSubmitSteer={submitSteerControl}
            pendingApprovals={[]}
            approvalCards={approvalCards}
            queuedMessages={[]}
            previousConversationKey={conversationNavigator.previousConversationKey}
            renaming={conversation ? renamingConversationKey === createConversationKey(conversation) : false}
            source={source}
            startStatus={startStatus}
          />
        ),
      };
    }

    return {
      detail: (
        <ConversationDetailPane
          conversationTitle={conversation.title}
          detailCopy={dictionary.detail}
          isCollapsed={isDetailCollapsed}
          isMobile={isMobileViewport}
          onBack={() => setMobilePane("main")}
          onCollapse={() => setIsDetailCollapsed(true)}
          target={selectedDetailTarget}
        />
      ),
      main: (
        <ConversationMain
          actionsCopy={dictionary.actions}
          assistantThread={assistantThread}
          canStartConversation={canStartConversation}
          canSubmitFollowUp={canSubmitFollowUp}
          activeTurnId={activeTurnId}
          controlStatus={controlStatus}
          conversation={conversation}
          conversationCopy={dictionary.conversation}
          copy={dictionary.mainPanels}
          detailCopy={dictionary.detail}
          followUpStatus={followUpStatus}
          isDetailCollapsed={isDetailCollapsed}
          isMobile={isMobileViewport}
          isSidebarCollapsed={isSidebarCollapsed}
          nextConversationKey={conversationNavigator.nextConversationKey}
          onBack={() => setMobilePane("sidebar")}
          onExpandDetail={() => setIsDetailCollapsed(false)}
          onExpandSidebar={() => setIsSidebarCollapsed(false)}
          onOpenDetail={(target) => {
            setSelectedDetailTarget(target);
            if (isMobileViewport) {
              setMobilePane("detail");
            }
          }}
          onSelectAdjacentConversation={selectConversation}
          onArchiveConversation={archiveConversation}
          onCancelQueuedMessage={cancelQueuedConversationMessage}
          onBeginRenameConversation={() => setRenamingConversationKey(createConversationKey(conversation))}
          onCancelRenameConversation={() => setRenamingConversationKey(null)}
          onQueueMessage={queueConversationMessage}
          onRenameConversation={renameConversation}
          onRestoreConversation={unarchiveConversation}
          onSendQueuedMessage={sendQueuedConversationMessage}
          onSubmitApprovalDecision={submitApprovalControl}
          onSubmitFollowUp={submitFollowUp}
          onSubmitInterrupt={submitInterruptControl}
          onSubmitStart={submitStart}
          onSubmitSteer={submitSteerControl}
          pendingApprovals={pendingApprovals}
          approvalCards={approvalCards}
          queuedMessages={queuedMessages}
          previousConversationKey={conversationNavigator.previousConversationKey}
          renaming={renamingConversationKey === createConversationKey(conversation)}
          source={source}
          startStatus={startStatus}
        />
      ),
    };
  })();

  const sidebarContent = (
    <Sidebar
      activeView={activeView}
      conversationNavigator={conversationNavigator}
      copy={{ actions: dictionary.actions, sidebar: dictionary.sidebar, status: dictionary.status }}
      device={device}
      isCollapsed={isSidebarCollapsed}
      isMobile={isMobileViewport}
      model={sidebarModel}
      onCollapseSidebar={() => setIsSidebarCollapsed(true)}
      onOpenSearch={() => setIsSearchOpen(true)}
      onArchiveConversation={archiveConversationByKey}
      onRenameConversation={beginRenameConversationByKey}
      onRestoreConversation={restoreConversationByKey}
      onSelectAdjacentConversation={selectConversation}
      onSelectConversation={selectConversation}
      onSelectView={selectView}
      onToggleProject={toggleProject}
      pressedItem={pressedItem}
      sectionState={sectionState}
      selectedConversationKey={selectedConversationKey ?? ""}
      sidebarScrollRef={sidebarScrollRef}
      onToggleSection={toggleSection}
    />
  );

  const connectionEntryDevices = resolveConnectionEntryDevices(devices, cachedConnectionDevices);
  const connectionEntryModel = createConnectionEntryModel({
    copy: dictionary.connection,
    devices: connectionEntryDevices,
    errorCode: source.error?.code ?? null,
    errorReason: typeof source.error?.details?.reason === "string" ? source.error.details.reason : null,
    isLoading: isWorkbenchLoading,
    selectedDeviceId,
    sourceReason: source.reason,
  });

  if (connectionEntryModel.status === "failed" || !hasCompletedConnectionSteps) {
    return (
      <ConnectionEntry
        copy={dictionary.connection}
        model={connectionEntryModel}
        onRetry={() => void refreshWorkbenchData(selectedConversationKey)}
        onSelectDevice={selectDevice}
      />
    );
  }

  return (
    <>
      {isMobileViewport ? (
        <div className="mobile-shell">
          {mobilePane === "sidebar" ? sidebarContent : null}
          {mobilePane === "main" ? mainContent.main : null}
          {mobilePane === "detail" ? mainContent.detail : null}
        </div>
      ) : (
        <ResizableWorkspaceShell
          copy={dictionary.sidebar}
          detail={mainContent.detail}
          isDetailCollapsed={isDetailCollapsed}
          isSidebarCollapsed={isSidebarCollapsed}
          main={mainContent.main}
          onDetailCollapsedChange={setIsDetailCollapsed}
          onSidebarCollapsedChange={setIsSidebarCollapsed}
          sidebar={sidebarContent}
        />
      )}
      <SearchDialog
        copy={dictionary.mainPanels}
        onClose={() => setIsSearchOpen(false)}
        onSelectConversation={selectConversation}
        open={isSearchOpen}
        searchRecents={searchRecents}
        selectedConversationKey={selectedConversationKey}
      />
    </>
  );
}

function getActiveTurnId(thread: AssistantThreadSnapshot | null): string | null {
  if (!thread) {
    return null;
  }

  for (let index = thread.timeline.turns.length - 1; index >= 0; index -= 1) {
    const turn = thread.timeline.turns[index];
    if (turn?.status === "in_progress") {
      return turn.id;
    }
  }

  return null;
}

function getSidebarInteractionSelector(item: { kind: "project" | "conversation"; id: string }): string {
  const escapedId = CSS.escape(item.id);
  return item.kind === "project" ? `[data-toggle-project="${escapedId}"]` : `[data-conversation-key="${escapedId}"]`;
}
