import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getBracket, getLiveScores, getStandings, getTournamentSummary } from "../services/tournamentService.js";

export const tournamentRoutes = express.Router();

tournamentRoutes.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    res.json(await getTournamentSummary());
  })
);

tournamentRoutes.get(
  "/standings",
  asyncHandler(async (_req, res) => {
    res.json(await getStandings());
  })
);

tournamentRoutes.get(
  "/bracket",
  asyncHandler(async (_req, res) => {
    res.json(await getBracket());
  })
);

tournamentRoutes.get(
  "/live",
  asyncHandler(async (_req, res) => {
    res.json(await getLiveScores());
  })
);

tournamentRoutes.get("/live/stream", async (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;

  const send = async () => {
    if (closed) {
      return;
    }

    try {
      const payload = await getLiveScores();
      res.write(`event: live-scores\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
    }
  };

  await send();
  const interval = setInterval(send, 15000);

  res.on("close", () => {
    closed = true;
    clearInterval(interval);
    res.end();
  });
});
