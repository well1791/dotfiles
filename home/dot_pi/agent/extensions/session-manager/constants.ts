// home/dot_pi/agent/extensions/session-manager/constants.ts

export const VIEWPORT_SIZE = 11;

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  delete: "ctrl+x",
  softDelete: "ctrl+d",
  rename: "ctrl+r",
  fork: "ctrl+f",
  scope: "ctrl+m",
  toggleHidden: "ctrl+h",
  select: "tab",
};

export const DEFAULT_COLORS: Record<string, string> = {
  active: "#9ED0FF",
  recent: "#FFD787",
  unnamed: "#FFAFAF",
  hidden: "242",
  subagent: "#FFD700",
  border: "#5FA8A0",
  text: "#FFFFFF",
  muted: "245",
  gold: "#FFD787",
  error: "#FF5F5F",
  shortcutKey: "#AFD7FF",
};
