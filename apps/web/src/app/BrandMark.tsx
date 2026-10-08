import logoUrl from "../assets/logo/diego-mark.svg";
import { de } from "../i18n/de.ts";

const LOGO_HEIGHT_PX = { small: 28, large: 96 };

/** The Diego frog next to the app name. */
export function BrandMark({ size }: { size: "small" | "large" }) {
  return <img className="brand-mark" src={logoUrl} alt={de.app.logoAlt} height={LOGO_HEIGHT_PX[size]} />;
}
