import { useState } from 'react';

/**
 * Password field with the 👁 / 🙈 toggle from the original build.
 */
export default function PasswordInput({ value, onChange, placeholder, id, className, autoComplete }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="pwd-wrap">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        className={'form-input' + (className ? ' ' + className : '')}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="pwd-eye"
        tabIndex={-1}
        title={shown ? 'Hide password' : 'Show password'}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? '🙈' : '👁'}
      </button>
    </div>
  );
}
