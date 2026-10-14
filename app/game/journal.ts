export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getJournalStreak(lastCheckin: string | null, streak: number, date: string, recording = false) {
  if (lastCheckin === date) return streak;
  const previousDay = new Date(`${date}T12:00:00`);
  previousDay.setDate(previousDay.getDate() - 1);
  const continued = lastCheckin === localDate(previousDay);
  return recording ? (continued ? streak + 1 : 1) : (continued ? streak : 0);
}
