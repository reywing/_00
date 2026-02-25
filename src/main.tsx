import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/** root 엘리먼트 보장 */
function ensureRoot(id: string) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

ReactDOM.createRoot(ensureRoot("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);