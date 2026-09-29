const PUBLIC_PAGES = new Set(["/login"]);

const PUBLIC_METADATA = new Set([
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
]);

const PUBLIC_ASSET_EXT = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$/i;

export function isLoginPath(pathname: string): boolean {
  return pathname === "/login";
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PAGES.has(pathname) || PUBLIC_METADATA.has(pathname) || PUBLIC_ASSET_EXT.test(pathname);
}
