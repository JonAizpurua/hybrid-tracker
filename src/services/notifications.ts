export const requestTimerNotifications = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
};

export const notifyRestFinished = () => {
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    new Notification('Rest finished', { body: 'Your next set is ready.', icon: './pwa-192x192.png', tag: 'rest-timer' });
  }
};
