/* Service worker mínimo: solo para mostrar las alertas de Llegadas/Salidas como notificaciones del celular.
   No guarda nada en caché (la página siempre se carga fresca). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const tab = (e.notification.data && e.notification.data.tab) || 'lle';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(L => {
    const c = L.find(x => x.url.includes(self.registration.scope));
    if(c){ c.postMessage({alerta: tab}); return c.focus(); }
    return self.clients.openWindow('./?app=1#' + tab);
  }));
});
