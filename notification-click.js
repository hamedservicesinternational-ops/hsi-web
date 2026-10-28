// Register before Firebase so clicks work for both running and closed PWAs.
self.addEventListener('notificationclick', (event) => {
  const payload = event.notification.data || {};
  const data = payload.FCM_MSG?.data || payload.data || payload;
  if (!data.notification_id && !data.type) return;
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil((async () => {
    const base = new URL('./', self.location.href);
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const client = windows.find(item => {
      const url = new URL(item.url);
      return url.origin === base.origin && url.pathname.startsWith(base.pathname);
    });
    if (client) {
      await client.focus();
      client.postMessage({type: 'hsi_notification_open', data});
      return;
    }
    if (data.notification_id) base.searchParams.set('hsi_notification', data.notification_id);
    await self.clients.openWindow(base.href);
  })());
});
