import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "doit_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getPassword(): string | null {
  const value = process.env.APP_PASSWORD;
  return value && value.length > 0 ? value : null;
}

export function isAuthConfigured(): boolean {
  return getPassword() !== null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyPassword(candidate: string): boolean {
  const password = getPassword();
  if (!password) {
    return false;
  }
  return safeEqual(candidate, password);
}

export function createSessionToken(): string | null {
  const password = getPassword();
  if (!password) {
    return null;
  }
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = String(exp);
  return `${payload}.${sign(payload, password)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) {
    return false;
  }
  const password = getPassword();
  if (!password) {
    return false;
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }
  const expected = sign(payload, password);
  if (!safeEqual(signature, expected)) {
    return false;
  }
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

function getBotApiToken(): string | null {
  const value = process.env.BOT_API_TOKEN;
  return value && value.length > 0 ? value : null;
}

export function isBotApiConfigured(): boolean {
  return getBotApiToken() !== null;
}

export function extractBearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(\S+)/i);
  if (!match) {
    return null;
  }
  return match[1];
}

export function verifyBotApiToken(candidate: string | undefined | null): boolean {
  const expected = getBotApiToken();
  if (!expected || !candidate) {
    return false;
  }
  return safeEqual(candidate, expected);
}

export function verifyBotBearer(authorization: string | null | undefined): boolean {
  return verifyBotApiToken(extractBearerToken(authorization));
}

export function isBotApiPath(pathname: string): boolean {
  return pathname === "/api/bots" || pathname.startsWith("/api/bots/");
}
