// Optional Web Push. prepare_web_release.py writes firebase-config.js from the
// same public build configuration supplied to Flutter. No private key belongs here.
importScripts('notification-click.js');
importScripts('firebase-config.js');
if (self.HSI_FIREBASE_CONFIG) {
  importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');
  firebase.initializeApp(self.HSI_FIREBASE_CONFIG);
  firebase.messaging();
}
