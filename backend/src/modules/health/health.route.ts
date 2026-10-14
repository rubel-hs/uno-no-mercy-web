import { Hono } from "hono";

import { healthResponse } from "./health.schema";

export const healthRoutes = new Hono().get("/", (context) =>
  context.json(healthResponse),
);
