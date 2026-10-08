import headUrl from "../assets/logo/diego-head.webp";
import portraitUrl from "../assets/logo/diego-portrait.webp";

const LOGOS = {
  small: { url: headUrl, sizePx: 28 },
  large: { url: portraitUrl, sizePx: 144 },
};

/** The Diego frog (decorative: the wordmark next to it already says "Diego"): the head next to the wordmark in the top bar, the portrait on the login screen. */
export function BrandMark({ size }: { size: "small" | "large" }) {
  const { url, sizePx } = LOGOS[size];
  return <img className={`brand-mark brand-mark-${size}`} src={url} alt="" width={sizePx} height={sizePx} />;
}
