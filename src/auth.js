import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  signInAnonymously,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

/* ============================================================
   FIREBASE AUTHENTICATION
   Email/password + Google sign-in for regular users. The Admin tab
   keeps the original shared-password login and does not touch Firebase.
   ============================================================ */

export function signUpWithEmail(email, password, displayName) {
  return createUserWithEmailAndPassword(auth, email, password).then(async (cred) => {
    if (displayName) {
      try { await updateProfile(cred.user, { displayName }); } catch { /* non-fatal */ }
    }
    return cred.user;
  });
}

export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password).then((cred) => cred.user);
}

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider).then((cred) => cred.user);
}

export function signOutFirebase() {
  return signOut(auth).catch(() => {});
}

/**
 * The Admin tab keeps the original shared-password login rather than a Firebase
 * account. We still sign in anonymously so every Firestore read/write happens as
 * an authenticated request and security rules can require `request.auth != null`.
 */
export function signInAsAnonymousAdmin() {
  return signInAnonymously(auth).then((cred) => cred.user).catch((e) => {
    console.warn('[auth] Anonymous sign-in unavailable:', e && e.code);
    return null;
  });
}

export function sendResetEmail(email) {
  return sendPasswordResetEmail(auth, email);
}

/** Change the signed-in user's own password. Requires the current password. */
export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in with Firebase. Please sign in again.');
  const usesPassword = (user.providerData || []).some((p) => p.providerId === 'password');
  if (!usesPassword) {
    throw new Error('This account signs in with Google, so it has no password to change.');
  }
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

/** Turn a Firebase auth error into something a person can act on. */
export function friendlyAuthError(e) {
  const code = (e && e.code) || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This username is already registered';
    case 'auth/invalid-email':
      return 'Invalid username format';
    case 'auth/weak-password':
      return 'Password is too weak — use at least 8 characters';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Incorrect username or password. (Reminder: this should be the password YOU chose at signup, not the admin password.)';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in Firebase Authentication → Settings → Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is disabled. Enable it in the Firebase console under Authentication → Sign-in method.';
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign in again before changing your password.';
    case 'auth/network-request-failed':
      return 'Network error — check your internet connection and try again.';
    default:
      return (e && e.message) ? e.message.replace(/^Firebase:\s*/, '') : String(e);
  }
}
