export type TimePeriod = "morning" | "noon" | "evening" | "night";

const foshanHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23" });

export function getFoshanTimePeriod(date = new Date()): TimePeriod {
  return getTimePeriod(Number(foshanHour.format(date)));
}

export function getTimePeriod(hour = new Date().getHours()): TimePeriod {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "noon";
  if (hour >= 16 && hour < 19) return "evening";
  return "night";
}
