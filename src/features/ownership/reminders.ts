import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listDocuments } from './documents';
import { parseIntervals } from './dates';
import { planReminders, reminderChanges } from './reminderPlan';

const channel = 'ownership-expiry';
let customChannel = Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  ? channel : undefined;
let pending = Promise.resolve();

export async function getReminderSettings(db: SQLiteDatabase) {
  return await db.getFirstAsync<{ enabled: number; intervals: string }>(
    'SELECT enabled, intervals FROM ownership_reminder_settings WHERE id = 1',
  ) ?? { enabled: 0, intervals: '30,15,7,1,0' };
}

export async function saveReminderSettings(db: SQLiteDatabase, enabled: boolean, intervals: string) {
  const values = parseIntervals(intervals);
  if (enabled) {
    if (customChannel) {
      try {
        await Notifications.setNotificationChannelAsync(customChannel, {
          name: 'Document expiry', importance: AndroidImportance.DEFAULT,
        });
      } catch {
        // Local alerts can use the host's default channel if a custom one is unavailable.
        customChannel = undefined;
      }
    }
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted && permission.ios?.status !== IosAuthorizationStatus.PROVISIONAL) {
      throw Error('Notifications are disabled by your device. Wallet expiry warnings remain available.');
    }
  }
  await db.runAsync('UPDATE ownership_reminder_settings SET enabled = ?, intervals = ? WHERE id = 1', Number(enabled), values.join(','));
  await reconcileReminders(db);
}

export function reconcileReminders(db: SQLiteDatabase) {
  const work = pending.then(async () => {
    const settings = await getReminderSettings(db);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const current = scheduled.flatMap(item => typeof item.content.data?.ownershipReminder === 'string'
      ? [{ id: item.identifier, key: item.content.data.ownershipReminder }] : []);
    const permission = settings.enabled ? await Notifications.getPermissionsAsync() : undefined;
    const allowed = permission?.granted || permission?.ios?.status === IosAuthorizationStatus.PROVISIONAL;
    const plan = allowed ? planReminders(await listDocuments(db), parseIntervals(settings.intervals), new Date()) : [];
    const changes = reminderChanges(plan, current);
    for (const id of changes.cancel) await Notifications.cancelScheduledNotificationAsync(id);
    for (const reminder of changes.schedule) await Notifications.scheduleNotificationAsync({
      content: { title: 'DriveSentry document reminder', body: 'Review an upcoming document expiry in your wallet.',
        data: { ownershipReminder: reminder.key, documentId: reminder.documentId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(reminder.at), channelId: customChannel },
    });
  });
  pending = work.catch(() => {});
  return work;
}
