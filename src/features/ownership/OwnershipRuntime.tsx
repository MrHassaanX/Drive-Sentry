import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import { cleanWalletFiles } from './files';
import { reconcileReminders } from './reminders';
import { cleanReports } from './exports';

export default function OwnershipRuntime() {
  const database = useSQLiteContext();
  useEffect(() => {
    const reconcile = () => {
      void cleanWalletFiles(database).catch(() => {});
      void reconcileReminders(database).catch(() => {});
      try { cleanReports(); } catch { /* Retry during a later foreground session. */ }
    };
    reconcile();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') reconcile(); });
    function open(response: Notifications.NotificationResponse) {
      const { ownershipReminder, documentId } = response.notification.request.content.data ?? {};
      if (typeof ownershipReminder === 'string' && Number.isSafeInteger(documentId)) {
        router.push({ pathname: '/documents', params: { edit: String(documentId) } });
        void Notifications.clearLastNotificationResponseAsync();
      }
    }
    const responses = Notifications.addNotificationResponseReceivedListener(open);
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    return () => { subscription.remove(); responses.remove(); };
  }, [database]);
  return null;
}
