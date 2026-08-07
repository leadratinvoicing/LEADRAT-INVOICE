import { useApp } from './AppContext';
import AuthScreen from './components/AuthScreen';
import MainApp from './MainApp';
import Toasts from './components/Toasts';

function StorageBanner() {
  const { storageHealthy, bannerDismissed, setBannerDismissed } = useApp();
  if (storageHealthy || bannerDismissed) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: '#FEE2E2', color: '#991B1B', padding: '10px 16px', fontSize: 13,
      textAlign: 'center', borderBottom: '2px solid #DC2626', fontFamily: 'system-ui, sans-serif'
    }}>
      ⚠ <strong>Storage unavailable.</strong> Data will not persist across page reloads.
      Check that Cloud Firestore is enabled for this Firebase project and that its security rules allow reads and writes.
      <button
        onClick={() => setBannerDismissed(true)}
        style={{ marginLeft: 12, background: '#991B1B', color: '#fff', border: 0, padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}
      >
        Dismiss
      </button>
    </div>
  );
}

export default function App() {
  const { booted, currentUser } = useApp();

  if (!booted) {
    return <div className="boot-screen">Loading Leadrat Invoicing…</div>;
  }

  return (
    <>
      <StorageBanner />
      {currentUser ? <MainApp /> : <AuthScreen />}
      <Toasts />
    </>
  );
}
