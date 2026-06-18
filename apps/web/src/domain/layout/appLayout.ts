export const appPanelLayout = {
  left: {
    id: "left",
    defaultSize: 280,
    minSize: 220,
    collapsedSize: 0,
  },
  main: {
    id: "main",
    minSize: 520,
  },
  right: {
    id: "right",
    defaultSize: 380,
    minSize: 300,
    maxSize: 560,
    collapsedSize: 0,
  },
  resizeHandleWidth: 1,
} as const;
