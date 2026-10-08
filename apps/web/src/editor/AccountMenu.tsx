import { useEffect, useRef, useState } from "react";
import { signOut } from "../auth/signIn.ts";
import { de } from "../i18n/de.ts";
import { MoreIcon } from "./icons.tsx";

/** A small menu behind a "more" button; for now it only holds sign-out. */
export function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: Event): void => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setIsOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [isOpen]);

  return (
    <div className="account-menu" ref={root}>
      <button className="icon-button" type="button" aria-label={de.panel.accountMenu} aria-expanded={isOpen} aria-haspopup="menu" onClick={() => setIsOpen((open) => !open)}>
        <MoreIcon />
      </button>
      {isOpen && (
        <div className="menu" role="menu">
          <button className="menu-item" type="button" role="menuitem" onClick={() => void signOut()}>{de.auth.signOut}</button>
        </div>
      )}
    </div>
  );
}
