import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getFixtureForecast } from "../services/tournamentService.js";

export const forecastRoutes = express.Router();

forecastRoutes.get(
  "/match/:fixtureId",
  asyncHandler(async (req, res) => {
    res.json(await getFixtureForecast(req.params.fixtureId));
  })
);
