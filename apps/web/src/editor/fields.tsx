import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CommitResult } from "../data/documentWriter.ts";
import { de } from "../i18n/de.ts";

type Commit<T> = (value: T) => Promise<CommitResult>;

const NUMBER_DISPLAY_DECIMALS = 2;

function roundForDisplay(value: number): string {
  return String(Number(value.toFixed(NUMBER_DISPLAY_DECIMALS)));
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") event.currentTarget.blur();
}

/** Commits the typed value on blur / Enter; Escape or a rejected commit puts the old value back. */
export function TextField({ label, value, placeholder, disabled, onCommit }: { label: string; value: string; placeholder?: string; disabled?: boolean; onCommit: Commit<string> }) {
  const id = useId();
  return (
    <div className="field-row">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        key={value}
        className="input"
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.value = value;
          blurOnEnter(event);
          if (event.key === "Escape") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const input = event.currentTarget;
          if (input.value === value) return;
          void onCommit(input.value).then((result) => {
            if (!result.ok) input.value = value;
          });
        }}
      />
    </div>
  );
}

export function NumberField({ label, value, step, unit, disabled, onCommit }: { label: string; value: number; step: number; unit: string; disabled?: boolean; onCommit: Commit<number> }) {
  const id = useId();
  return (
    <div className="field-row">
      <label className="field-label" htmlFor={id}>{label}</label>
      <span className="field-input-with-unit">
        <input
          id={id}
          key={value}
          className="input"
          type="number"
          step={step}
          defaultValue={roundForDisplay(value)}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Escape") event.currentTarget.value = roundForDisplay(value);
            blurOnEnter(event);
            if (event.key === "Escape") event.currentTarget.blur();
          }}
          onBlur={(event) => {
            const input = event.currentTarget;
            const typed = input.valueAsNumber;
            if (Number.isNaN(typed) || typed === value) {
              input.value = roundForDisplay(value);
              return;
            }
            void onCommit(typed).then((result) => {
              if (!result.ok) input.value = roundForDisplay(value);
            });
          }}
        />
        <span className="field-unit">{unit}</span>
      </span>
    </div>
  );
}

type SliderFieldProps = { label: string; value: number; min: number; max: number; step: number; unit: string; isAdjusted: boolean; onCommit: Commit<number> };

/** A slider with a number field; nothing is written while dragging, one commit on release (or Enter / blur in the number). */
export function SliderField({ label, value, min, max, step, unit, isAdjusted, onCommit }: SliderFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;

  const commitDraft = (): void => {
    if (draft === null) return;
    const next = draft;
    if (next === value) {
      setDraft(null);
      return;
    }
    void onCommit(next).finally(() => setDraft(null));
  };

  return (
    <div className="field-row field-slider">
      <label className="field-label" htmlFor={id}>
        {label}
        {isAdjusted && <span className="dot-mustard" title={de.inspector.adjusted} role="img" aria-label={de.inspector.adjusted} />}
      </label>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(event) => setDraft(event.currentTarget.valueAsNumber)}
        onPointerUp={commitDraft}
        onKeyUp={commitDraft}
        onBlur={commitDraft}
      />
      <span className="field-input-with-unit">
        <input
          className="input"
          type="number"
          step={step}
          aria-label={label}
          key={value}
          defaultValue={roundForDisplay(value)}
          onKeyDown={blurOnEnter}
          onBlur={(event) => {
            const input = event.currentTarget;
            const typed = input.valueAsNumber;
            if (Number.isNaN(typed) || typed === value) {
              input.value = roundForDisplay(value);
              return;
            }
            void onCommit(typed).then((result) => {
              if (!result.ok) input.value = roundForDisplay(value);
            });
          }}
        />
        <span className="field-unit">{unit}</span>
      </span>
    </div>
  );
}

/** A checkbox drawn as an LED dot (design 6.9). */
export function LedCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="led-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className="led-check-dot" aria-hidden="true" />
      {label}
    </label>
  );
}

export function FactList({ facts }: { facts: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
