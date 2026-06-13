import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getChampionOdds } from "../services/tournamentService.js";

export const oddsRoutes = express.Router();

oddsRoutes.get(
  "/champion",
  asyncHandler(async (_req, res) => {
    res.json(await getChampionOdds());
  })
);
