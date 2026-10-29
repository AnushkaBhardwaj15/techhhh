import { useCallback, useEffect, useState } from 'react';
import { notificationEvent, type Notice } from '../lib/notifications';
import { Toast } from './Toast';

export function NotificationHost() {
  const [notice, setNotice] = useState<(Notice & { id: number }) | null>(null);
  const dismiss = useCallback(() => setNotice(null), []);
  useEffect(() => {
    let id = 0;
    const receive = (event: Event) => setNotice({ ...(event as CustomEvent<Notice>).detail, id: ++id });
    window.addEventListener(notificationEvent, receive);
    return () => window.removeEventListener(notificationEvent, receive);
  }, []);
  return notice ? <Toast key={notice.id} message={notice.message} title={notice.title} tone={notice.tone} onDismiss={dismiss} /> : null;
}
