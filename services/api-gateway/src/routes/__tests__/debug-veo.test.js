import request from "supertest";
import express from "express";
import { describe, it, expect, afterEach, vi } from "vitest";
import { debugVeoRouter } from "../debug-veo.js";
import * as veoClient from "../../video/veo-client.js";

describe("debugVeoRouter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the current quota snapshot", async () => {
    const snapshot = {
      perMinCount: 3,
      last429At: Date.now(),
      inFlight: 1,
      softLimit: 20,
      warn: false
    };
    vi.spyOn(veoClient.vertexQuotaMeter, "getSnapshot").mockReturnValue(snapshot);

    const app = express();
    app.use("/debug", debugVeoRouter());

    const response = await request(app).get("/debug/veo/quota").expect(200);
    expect(response.body).toEqual({ quota: snapshot });
  });

  it("returns the current operation snapshot", async () => {
    vi.spyOn(veoClient.vertexQuotaMeter, "getSnapshot").mockReturnValue({
      perMinCount: 0,
      last429At: null,
      inFlight: 0,
      softLimit: 20,
      warn: false
    });
    vi.spyOn(veoClient, "getVertexOperationsSnapshot").mockReturnValue([
      { operationName: "operations/test", status: "predicting" }
    ]);

    const app = express();
    app.use("/debug", debugVeoRouter());
    const response = await request(app).get("/debug/veo/operations").expect(200);
    expect(response.body.operations).toEqual([{ operationName: "operations/test", status: "predicting" }]);
  });
});
