import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { CommitResult } from "../data/documentWriter.ts";
import { de } from "../i18n/de.ts";

type Commit<T> = (value: T) => Promise<CommitResult>;

const NUMBER_DISPLAY_DECIMALS = 2;

function roundForDisplay(value: number): string {
  return String(Number(value.toFixed(NUMBER_DISPLAY_DECIMALS)));
}

/** Commits the typed text on blur / Enter; Escape or a rejected commit puts the old text back. */
export function TextField({ label, value, placeholder, disabled, onCommit }: { label: string; value: string; placeholder?: string; disabled?: boolean; onCommit: Commit<string> }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const valueNow = useRef(value);
  valueNow.current = value;
  const textAtFocus = useRef(value);

  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = value;
  }, [value]);

  const restore = (): void => {
    if (input.current) input.current.value = valueNow.current;
  };

  return (
    <div className="field-row">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        className="input"
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(event) => {
          textAtFocus.current = event.currentTarget.value;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") restore();
          if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          if (event.currentTarget.value === textAtFocus.current) {
            restore();
            return;
          }
          void onCommit(event.currentTarget.value).then((result) => {
            if (!result.ok) restore();
          });
        }}
      />
    </div>
  );
}

type CommitNumberInputProps = { id?: string; ariaLabel?: string; value: number; step: number; disabled?: boolean; onCommit: Commit<number> };

/**
 * A number input that commits on blur / Enter only when the user changed what is shown: focusing and leaving
 * a field never writes, and a value with more decimals than displayed is not rounded silently. An external
 * value change updates the field in place (no remount) unless the user is typing in it.
 */
function CommitNumberInput({ id, ariaLabel, value, step, disabled, onCommit }: CommitNumberInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const shown = roundForDisplay(value);
  const shownNow = useRef(shown);
  shownNow.current = shown;
  const textAtFocus = useRef(shown);

  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = shown;
  }, [shown]);

  const restore = (): void => {
    if (input.current) input.current.value = shownNow.current;
  };

  return (
    <input
      ref={input}
      id={id}
      aria-label={ariaLabel}
      className="input"
      type="number"
      step={step}
      defaultValue={shown}
      disabled={disabled}
      onFocus={(event) => {
        textAtFocus.current = event.currentTarget.value;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") restore();
        if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
      }}
      onBlur={(event) => {
        if (event.currentTarget.value === textAtFocus.current) {
          restore();
          return;
        }
        const typed = event.currentTarget.valueAsNumber;
        if (Number.isNaN(typed) || typed === value) {
          restore();
          return;
        }
        void onCommit(typed).then((result) => {
          if (!result.ok) restore();
        });
      }}
    />
  );
}

export function NumberField({ label, value, step, unit, disabled, onCommit }: { label: string; value: number; step: number; unit: string; disabled?: boolean; onCommit: Commit<number> }) {
  const id = useId();
  return (
    <div className="field-row">
      <label className="field-label" htmlFor={id}>{label}</label>
      <span className="field-input-with-unit">
        <CommitNumberInput id={id} value={value} step={step} disabled={disabled} onCommit={onCommit} />
        <span className="field-unit">{unit}</span>
      </span>
    </div>
  );
}

type SliderFieldProps = { label: string; value: number; min: number; max: number; step: number; unit: string; isAdjusted: boolean; onCommit: Commit<number> };

/** A slider with a number field; nothing is written while dragging, one commit on release (also outside the slider), Enter or blur. */
export function SliderField({ label, value, min, max, step, unit, isAdjusted, onCommit }: SliderFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<number | null>(null);
  const isCommitting = useRef(false);
  const shown = draft ?? value;

  const commitDraft = (): void => {
    if (draft === null || isCommitting.current) return;
    if (draft === value) {
      setDraft(null);
      return;
    }
    isCommitting.current = true;
    void onCommit(draft).finally(() => {
      isCommitting.current = false;
      setDraft(null);
    });
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
        // Capturing the pointer delivers the release to the slider even when it happens outside of it.
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerUp={commitDraft}
        onLostPointerCapture={commitDraft}
        onKeyUp={commitDraft}
        onBlur={commitDraft}
      />
      <span className="field-input-with-unit">
        <CommitNumberInput ariaLabel={label} value={value} step={step} onCommit={onCommit} />
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
