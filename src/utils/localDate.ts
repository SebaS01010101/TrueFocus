const padDatePart = (value: number): string => value.toString().padStart(2, "0");

export const getDateKey = (date: Date = new Date()): string => {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
};

export const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey
    .split("-")
    .map((part) => Number.parseInt(part, 10));

  return new Date(year, month - 1, day);
};

export const addDaysToDateKey = (dateKey: string, days: number): string => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return getDateKey(date);
};

export const getWeekStartDateKey = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return getDateKey(date);
};
