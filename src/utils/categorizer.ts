import type { AppUsageItem } from "../shared/types";

export type CategoryType =
  | "Productivity"
  | "Social"
  | "Entertainment"
  | "Browsing"
  | "Creativity"
  | "Reading"
  | "Other";

export interface CategoryInfo {
  name: string;
  color: string;
  icon: string;
}

export const CATEGORY_INFO: Record<CategoryType, CategoryInfo> = {
  Productivity: {
    name: "Productividad",
    color: "#4ECDC4", // Turquesa
    icon: "💻",
  },
  Social: {
    name: "Comunicación",
    color: "#96CEB4", // Verde menta
    icon: "💬",
  },
  Entertainment: {
    name: "Entretenimiento",
    color: "#FF6B6B", // Rojo coral
    icon: "🎮",
  },
  Browsing: {
    name: "Navegación",
    color: "#45B7D1", // Azul cielo
    icon: "🌐",
  },
  Creativity: {
    name: "Creatividad",
    color: "#FFEAA7", // Amarillo suave
    icon: "🎨",
  },
  Reading: {
    name: "Lectura",
    color: "#DFE6E9", // Gris claro
    icon: "📚",
  },
  Other: {
    name: "Otros",
    color: "#B8B8B8", // Gris medio
    icon: "⚙️",
  },
};

const CATEGORY_RULES: Record<string, string[]> = {
  Productivity: [
    "code",
    "visual studio",
    "vscode",
    "figma",
    "notion",
    "excel",
    "word",
    "powerpoint",
    "slack",
    "outlook",
    "mail",
    "numbers",
    "terminal",
    "cursor",
    "intellij",
    "pycharm",
    "webstorm",
    "sublime",
    "atom",
    "notepad++",
    "vim",
    "postman",
    "docker",
    "kubernetes",
    "libreoffice",
    "obsidian",
    "trello",
    "asana",
    "jira",
    "github",
    "gitkraken",
  ],
  Social: [
    "whatsapp",
    "discord",
    "telegram",
    "messenger",
    "zoom",
    "teams",
    "signal",
    "skype",
  ],
  Entertainment: [
    "spotify",
    "youtube",
    "netflix",
    "steam",
    "game",
    "vlc",
    "twitch",
    "epic games",
    "minecraft",
    "league of legends",
    "valorant",
    "fortnite",
  ],
  Browsing: [
    "chrome",
    "firefox",
    "safari",
    "edge",
    "brave",
    "opera",
    "vivaldi",
  ],
  Creativity: [
    "photoshop",
    "illustrator",
    "sketch",
    "blender",
    "inkscape",
    "gimp",
    "premiere",
    "after effects",
    "davinci",
    "audacity",
    "fl studio",
    "ableton",
    "logic pro",
  ],
  Reading: [
    "kindle",
    "calibre",
    "adobe reader",
    "pdf",
    "reader",
    "books",
    "pocket",
  ],
};

export const getAppCategory = (
  appName: string,
  title: string,
): CategoryType => {
  const searchStr = (appName + " " + title).toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some((keyword) => searchStr.includes(keyword))) {
      return category as CategoryType;
    }
  }
  return "Other";
};

export const calculateCategoryStats = (apps: AppUsageItem[]) => {
  const stats: Record<CategoryType, number> = {
    Productivity: 0,
    Social: 0,
    Entertainment: 0,
    Browsing: 0,
    Creativity: 0,
    Reading: 0,
    Other: 0,
  };

  apps.forEach((app) => {
    const cat = getAppCategory(app.name, app.title);
    stats[cat] += app.seconds;
  });

  return stats;
};
