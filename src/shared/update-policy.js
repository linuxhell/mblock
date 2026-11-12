// SPDX-License-Identifier: GPL-3.0-only
export const UPDATE_INTERVALS = Object.freeze([1, 6, 12, 24, 48]);
export function validUpdateInterval(hours) { return UPDATE_INTERVALS.includes(hours); }
export function updateAlarm(settings, sources, now = Date.now()) {
  if (!settings.autoUpdate) return null;
  const interval = validUpdateInterval(settings.intervalHours) ? settings.intervalHours : 12;
  const selected = (settings.sourceIds || []).map(id => sources?.find(s => s.id === id));
  const timestamps = selected.map(s => Date.parse(s?.fetchedAt));
  const oldest = timestamps.length && timestamps.every(Number.isFinite) ? Math.min(...timestamps) : 0;
  // Preserve the age of filters across worker wakes and browser restarts.
  return { when: Math.max(now + 120000, oldest + interval * 3600000), periodInMinutes: interval * 60 };
}
export function unchangedLists(previous, next) {
  return previous.length === next.length && next.every(s => previous.some(p => p.id === s.id && p.sha256 === s.sha256));
}
