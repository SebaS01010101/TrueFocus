import type { AppUsageItem } from '../shared/types';

export type CategoryType = 'Productivity' | 'Social' | 'Entertainment' | 'Other';

const CATEGORY_RULES: Record<string, string[]> = {
  Productivity: ['code', 'visual studio', 'figma', 'notion', 'excel', 'word', 'slack', 'outlook', 'mail', 'numbers', 'terminal', 'cursor'],
  Social: ['whatsapp', 'discord', 'telegram', 'messenger', 'zoom', 'teams', 'signal'],
  Entertainment: ['spotify', 'youtube', 'netflix', 'steam', 'game', 'vlc', 'twitch'],
};

export const getAppCategory = (appName: string, title: string): CategoryType => {
  const searchStr = (appName + " " + title).toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some(keyword => searchStr.includes(keyword))) {
      return category as CategoryType;
    }
  }
  return 'Other'; 
};

export const calculateCategoryStats = (apps: AppUsageItem[]) => {
  const stats: Record<CategoryType, number> = {
    Productivity: 0,
    Social: 0,
    Entertainment: 0,
    Other: 0
  };

  apps.forEach(app => {
    const cat = getAppCategory(app.name, app.title);
    stats[cat] += app.seconds;
  });

  return stats;
};