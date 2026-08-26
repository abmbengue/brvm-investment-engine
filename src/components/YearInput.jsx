import { useState, useEffect, useRef } from 'react';

/**
 * Year input: free typing while focused; clamp/commit on blur / Enter / steppers.
 * Avoids the controlled number-input bug where intermediate digits snap back.
 */
export function clampYear(raw, { min = 1990, max = 2200, fallback } = {}) {
  const s = String(raw ?? '').trim();
  if (!s || !/^\d+$/.test(s)) return fallback;
  const n = Math.trunc(Number(s));
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export default function YearInput({
  id,
  label,
  value,
  min = 1990,
  max = 2200,
  maxLength = 4,
  onValueChange,
  commitSignal = 0,
}) {
  const [text, setText] = useState(() => String(value ?? ''));
  const [focused, setFocused] = useState(false);
  const lastExternal = useRef(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!focused && value !== lastExternal.current) {
      lastExternal.current = value;
      setText(String(value ?? ''));
    }
  }, [value, focused]);

  useEffect(() => {
    if (commitSignal === 0) return;
    commit(inputRef.current?.value ?? text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitSignal]);

  function commit(raw) {
    const source = raw !== undefined ? raw : text;
    const y = clampYear(source, { min, max, fallback: value });
    setText(String(y));
    lastExternal.current = y;
    onValueChange(y);
  }

  function step(delta) {
    const base = clampYear(text, { min, max, fallback: value });
    commit(String(Math.max(min, Math.min(max, base + delta))));
  }

  return (
    <label className="field year-field">
      {label}
      <br />
      <span className="year-input-row">
        <button
          type="button"
          className="year-step"
          aria-label={`Diminuer ${label}`}
          onClick={() => step(-1)}
        >
          −
        </button>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={maxLength}
          value={text}
          onChange={(e) =>
            setText(e.target.value.replace(/[^\d]/g, '').slice(0, maxLength))
          }
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
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
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              step(1);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              step(-1);
            }
          }}
        />
        <button
          type="button"
          className="year-step"
          aria-label={`Augmenter ${label}`}
          onClick={() => step(1)}
        >
          +
        </button>
      </span>
    </label>
  );
}
