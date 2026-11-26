import { reminderDates } from './dates.ts';

export type Reminder = { documentId: number; at: number; key: string };
export function planReminders(docs: { id: number; expires_on: string | null }[], intervals: number[], now: Date): Reminder[] {
  return docs.flatMap(doc => reminderDates(doc.expires_on, intervals, now).map(date => ({
    documentId: doc.id, at: +date, key: doc.id + ':' + +date,
  }))).sort((a, b) => a.at - b.at || a.documentId - b.documentId).slice(0, 60);
}

export function reminderChanges(plan: Reminder[], existing: { id: string; key: string }[]) {
  const wanted = new Set(plan.map(item => item.key));
  const kept = new Set<string>();
  const cancel: string[] = [];
  for (const item of existing) {
    if (!wanted.has(item.key) || kept.has(item.key)) cancel.push(item.id);
    else kept.add(item.key);
  }
  return { cancel, schedule: plan.filter(item => !kept.has(item.key)) };
}
