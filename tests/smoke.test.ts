import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("smoke tests", () => {
  it("serves health and product listing", async () => {
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });

    const products = await request(app).get("/products");
    expect(products.status).toBe(200);
    expect(Array.isArray(products.body)).toBe(true);
  });
});
