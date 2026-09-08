import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = Response & {
  statusCode: number;
  payload: unknown;
};

function response(): MockResponse {
  const result = {
    locals: {},
    statusCode: 200,
    payload: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
  return result as unknown as MockResponse;
}

async function middleware() {
  process.env.GOOGLE_CLIENT_ID = "client.apps.googleusercontent.com";
  process.env.ALLOWED_EMAIL_DOMAIN = "consistem.com.br";
  vi.resetModules();
  return (await import("./auth.js")).requireAuth;
}

describe("Google OAuth middleware", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("rejeita requisição sem token", async () => {
    const requireAuth = await middleware();
    const res = response();
    await requireAuth({ headers: {} } as Request, res, vi.fn() as NextFunction);
    expect(res.statusCode).toBe(401);
  });

  it("aceita token do cliente e domínio configurados", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      aud: "client.apps.googleusercontent.com",
      sub: "user-1",
      email: "pessoa@consistem.com.br",
      email_verified: "true",
      expires_in: "3000",
    }), { status: 200 })));
    const requireAuth = await middleware();
    const res = response();
    const next = vi.fn();
    await requireAuth({ headers: { authorization: "Bearer google-token" } } as Request, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.locals.uid).toBe("user-1");
  });

  it("rejeita token emitido para outro cliente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      aud: "other-client",
      sub: "user-1",
      email: "pessoa@consistem.com.br",
      email_verified: "true",
      expires_in: "3000",
    }), { status: 200 })));
    const requireAuth = await middleware();
    const res = response();
    await requireAuth({ headers: { authorization: "Bearer google-token" } } as Request, res, vi.fn());
    expect(res.statusCode).toBe(401);
  });
});
