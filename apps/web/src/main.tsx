import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { de } from "./i18n/de.ts";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element missing");

createRoot(rootElement).render(
  <StrictMode>
    <main>{de.app.title}</main>
  </StrictMode>,
);
