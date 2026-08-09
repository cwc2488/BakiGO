export const AUTH_PUBLIC_PATHS = new Set(["/login", "/register"]);
export const OPEN_PUBLIC_PATHS = new Set(["/privacy", "/data-deletion", "/meta-review"]);

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isOpenPublicPath(pathname: string): boolean {
  return OPEN_PUBLIC_PATHS.has(normalizePathname(pathname));
}

export function isAuthPublicPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return AUTH_PUBLIC_PATHS.has(normalized) || normalized.startsWith("/c/");
}

export function isPublicPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return isOpenPublicPath(normalized) || isAuthPublicPath(normalized);
}

export function shouldRedirectAuthenticatedUser(pathname: string): boolean {
  return isAuthPublicPath(pathname);
}
