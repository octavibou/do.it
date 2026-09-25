import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { AppNav } from "@/components/app-nav";
import { ShellFrame } from "@/components/shell-frame";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <ShellFrame className="items-center gap-3 py-3">
          <Link href="/" className="shrink-0 font-medium tracking-tight">
            do.it
          </Link>
          <AppNav />
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </ShellFrame>
      </header>
      <ShellFrame as="main" className="flex-1 flex-col py-6">
        {children}
      </ShellFrame>
    </div>
  );
}
