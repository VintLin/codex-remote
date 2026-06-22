export const zhCNDictionary = {
  metadata: {
    title: "Codex Remote",
    description: "自托管多设备 Codex 控制中心",
  },
  app: {
    conversationTitle: "对话",
    settingsTitle: "设置",
    disconnectedDeviceName: "未连接设备",
  },
  settings: {
    languageLabel: "语言",
    languageChinese: "简体中文",
    languageEnglish: "English",
  },
} as const;

export type ZhCNDictionary = typeof zhCNDictionary;
