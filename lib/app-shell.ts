import { cn } from "cn";

export function isProjectBoardPath(pathname: string): boolean {
  return /^\/projects\/[^/]+\/?$/.test(pathname);
}

export function appShellContainerClassName(pathname: string, className?: string): string {
  return cn(
    "mx-auto flex w-full px-4",
    isProjectBoardPath(pathname) ? "max-w-none" : "max-w-6xl",
    className
  );
}
