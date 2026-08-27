import { deleteApp, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as analyticsSupported } from 'firebase/analytics';
import {
  browserLocalPersistence, getAuth, GoogleAuthProvider, inMemoryPersistence, setPersistence, signOut
} from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC-4yHzpSXz3t_JJFU4_Sy2JZNUURGBZIg',
  authDomain: 'leadrat-invoicing.firebaseapp.com',
  projectId: 'leadrat-invoicing',
  storageBucket: 'leadrat-invoicing.firebasestorage.app',
  messagingSenderId: '734222683672',
  appId: '1:734222683672:web:c145f3bcc2fe4349ad7d6d',
  measurementId: 'G-QZEVJPGHTW'
};

export const app = initializeApp(firebaseConfig);

// ignoreUndefinedProperties keeps writes from throwing on optional invoice/client
// fields that were never filled in — the original storage layer tolerated those.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Analytics only initialises in browsers that support it (and over https/localhost).
analyticsSupported()
  .then((ok) => { if (ok) getAnalytics(app); })
  .catch(() => {});

/**
 * A throwaway second Firebase app used only to create accounts on an admin's
 * behalf. `createUserWithEmailAndPassword` signs the new account in on whatever
 * app it runs against, so running it on the primary app would sign the admin
 * out. The secondary app has its own auth instance with no persistence, so the
 * admin's session is never touched.
 */
export function withSecondaryAuth(fn) {
  const name = 'admin-provision-' + Date.now();
  const secondaryApp = initializeApp(firebaseConfig, name);
  const secondaryAuth = getAuth(secondaryApp);
  return Promise.resolve()
    .then(() => setPersistence(secondaryAuth, inMemoryPersistence).catch(() => {}))
    .then(() => fn(secondaryAuth))
    .finally(async () => {
      try { await signOut(secondaryAuth); } catch { /* already signed out */ }
      try { await deleteApp(secondaryApp); } catch { /* nothing to clean up */ }
    });
}
