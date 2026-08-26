/**
 * Year dropdown — reliable independent selection (no typing/snap issues).
 */
export function buildYearOptions(min, max) {
  const lo = Math.trunc(Number(min));
  const hi = Math.trunc(Number(max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
  const out = [];
  for (let y = lo; y <= hi; y++) out.push(y);
  return out;
}

export default function YearSelect({
  id,
  label,
  value,
  min = 2000,
  max = 2100,
  onValueChange,
}) {
  const options = buildYearOptions(min, max);
  const selected = options.includes(Number(value))
    ? Number(value)
    : options.includes(Math.trunc(Number(value)))
      ? Math.trunc(Number(value))
      : options[0];

  return (
    <label className="field year-select-field">
      {label}
      <br />
      <select
        id={id}
        value={selected}
        onChange={(e) => onValueChange(Math.trunc(Number(e.target.value)))}
      >
        {options.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
