import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./globals.css";

document.documentElement.dataset.platform = window.simpleton.platform;

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
