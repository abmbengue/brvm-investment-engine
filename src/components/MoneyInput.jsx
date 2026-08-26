import { useState, useEffect, useRef } from 'react';
import { parseMoney, formatMoney } from '../lib/money.js';

/**
 * Money input: natural typing while focused; format on blur / Enter / paste / external commit.
 */
export default function MoneyInput({
  id,
  label,
  value,
  onValueChange,
  commitSignal = 0,
}) {
  const [text, setText] = useState(() => formatMoney(value));
  const [focused, setFocused] = useState(false);
  const lastExternal = useRef(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!focused && value !== lastExternal.current) {
      lastExternal.current = value;
      setText(formatMoney(value));
    }
  }, [value, focused]);

  useEffect(() => {
    if (commitSignal === 0) return;
    const current = inputRef.current?.value ?? text;
    const n = parseMoney(current);
    const formatted = hasDigits(current) ? formatMoney(n) : '';
    setText(formatted);
    lastExternal.current = n;
    onValueChange(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitSignal]);

  function hasDigits(v) {
    return /\d/.test(String(v ?? ''));
  }

  function commit(raw) {
    const source = raw !== undefined ? raw : text;
    const n = parseMoney(source);
    const formatted = hasDigits(source) ? formatMoney(n) : '';
    setText(formatted);
    lastExternal.current = n;
    onValueChange(n);
  }

  return (
    <label className="field">
      {label}
      <br />
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData?.getData('text');
          if (pasted == null) return;
          e.preventDefault();
          const next = pasted;
          setText(next);
          // Format after paste (required)
          setTimeout(() => commit(next), 0);
        }}
      />
    </label>
  );
}
