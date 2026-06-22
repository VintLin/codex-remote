import type { WebDictionary } from "../dictionary";

export const enUSDictionary = {
  metadata: {
    title: "Codex Remote",
    description: "Self-hosted multi-device Codex control plane",
  },
  app: {
    conversationTitle: "Conversation",
    settingsTitle: "Settings",
    disconnectedDeviceName: "Disconnected device",
  },
  settings: {
    languageLabel: "Language",
    languageChinese: "简体中文",
    languageEnglish: "English",
  },
} as const satisfies WebDictionary;
