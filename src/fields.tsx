import { useEffect, useState } from "react";
/** Number input that applies on Enter or blur and restores the last value when the entry is invalid. */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  onInvalid,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  onInvalid?: () => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onBlur={() => {
          const v = draft.trim() ? Number(draft) : NaN;
          if (Number.isFinite(v) && v >= min) {
            if (v !== value) onChange(v);
          } else {
            setDraft(String(value));
            onInvalid?.();
          }
        }}
      />
    </label>
  );
}
