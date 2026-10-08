import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import { de } from "./i18n/de.ts";
import { platform } from "./platform/index.ts";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element missing");

platform.window.setTitle(de.app.title);

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
