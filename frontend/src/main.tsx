import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initFaro } from "./lib/faro";
import { AppBootstrap } from "./components/shell/AppBootstrap";

initFaro();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppBootstrap />
  </StrictMode>,
);
