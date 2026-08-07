import { useApp } from '../AppContext';

export default function Toasts() {
  const { toasts } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={'toast' + (t.type ? ' ' + t.type : '')}>{t.msg}</div>
      ))}
    </div>
  );
}
