/* The push-only service worker (SPEC.md § Installable app § The service worker).
 *
 * Exactly three events, and it must never gain a `fetch` handler: every route
 * renders dynamically so its scripts carry the per-request CSP nonce, and a
 * worker that cached HTML would serve pages whose nonces no longer match the
 * response header — every script silently blocked. Offline support is out for
 * the same reason: offline IS a fetch handler.
 */

self.addEventListener("activate", (event) => {
  /* Take control of already-open tabs immediately: notificationclick's
     navigate() rejects on windows this worker does not control, and without
     claim() a tab open since before registration stays uncontrolled until it
     reloads. Safe precisely because there is no fetch handler — claiming
     changes who may navigate a tab, never what its requests return. */
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "KarirKalyan", body: "", url: "/dashboard" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    /* An unparsable payload still shows the default notification: a push the
       user granted permission for should never vanish silently. */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/brand/icons/png/icon-primary-192.png",
      badge: "/brand/icons/png/icon-monochrome-512.png",
      /* One notification per subject: a re-delivered push (the server job
         retries transient failures) replaces the copy already showing instead
         of stacking a duplicate. The tag comes from the payload so different
         subjects don't collapse into one -- the follow-up digest sends none and
         keeps its historical fixed tag; interview and residence reminders each
         send their own (v1.10.0). */
      tag: payload.tag || "follow-up-digest",
      renotify: true,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => "focus" in w);
      if (existing) {
        await existing.focus();
        try {
          await existing.navigate(url);
        } catch {
          /* An uncontrolled window cannot be navigated — focus is enough. */
        }
        return;
      }
      await clients.openWindow(url);
    })(),
  );
});
