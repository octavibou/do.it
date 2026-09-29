import assert from "node:assert/strict";

import { isLoginPath, isPublicPath } from "../lib/public-paths.ts";

const publicPaths = [
  "/login",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  "/apple-touch-icon.png",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/opengraph-image.png",
  "/twitter-image.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/brand/icon.png",
];

const gatedPaths = [
  "/",
  "/bots",
  "/settings",
  "/projects/leadflow",
  "/api/bots/7d765d6a-63aa-4d4d-9914-0b3d26dee739/current",
  "/api/bots/7d765d6a-63aa-4d4d-9914-0b3d26dee739/tasks",
];

for (const pathname of publicPaths) {
  assert.equal(isPublicPath(pathname), true, `${pathname} should be public`);
}

for (const pathname of gatedPaths) {
  assert.equal(isPublicPath(pathname), false, `${pathname} should stay gated`);
}

assert.equal(isLoginPath("/login"), true);
assert.equal(isLoginPath("/manifest.webmanifest"), false);

console.log("public paths ok");
