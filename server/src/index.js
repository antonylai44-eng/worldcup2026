import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { forecastRoutes } from "./routes/forecastRoutes.js";
import { oddsRoutes } from "./routes/oddsRoutes.js";
import { tournamentRoutes } from "./routes/tournamentRoutes.js";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true
  })
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "world-cup-prediction-api",
    environment: env.nodeEnv
  });
});

app.use("/api/tournament", tournamentRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/odds", oddsRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.originalUrl
  });
});

app.use((error, _req, res, _next) => {
  const status = error.status ?? 500;

  res.status(status).json({
    error: error.message,
    provider: error.provider,
    details: env.nodeEnv === "development" ? error.details : undefined
  });
});

app.listen(env.port, () => {
  console.log(`World Cup Prediction API listening on http://localhost:${env.port}`);
});
