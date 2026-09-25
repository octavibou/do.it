"use client";

import { usePathname } from "next/navigation";

import { appShellContainerClassName } from "@/lib/app-shell";

export function ShellFrame({
  as: Comp = "div",
  className,
  children,
}: {
  as?: "div" | "main";
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return <Comp className={appShellContainerClassName(pathname, className)}>{children}</Comp>;
}
