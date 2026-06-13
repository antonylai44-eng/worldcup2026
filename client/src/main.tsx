import React from "react";
import ReactDOM from "react-dom/client";
import { TournamentDashboard } from "./components/TournamentDashboard";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TournamentDashboard />
  </React.StrictMode>
);
