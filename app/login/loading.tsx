import { BrandLockup } from "@/components/brand-mark";

export default function LoginLoading() {
  return (
    <div className="flex min-h-full items-center justify-center px-4" aria-busy="true" aria-live="polite">
      <div className="w-full max-w-sm rounded-2xl bg-background p-6 ring-1 ring-foreground/10">
        <BrandLockup markSize={28} className="text-sm" />
        <h1 className="mt-4 text-2xl font-medium tracking-tight">Entrar</h1>
        <div className="mt-6 grid gap-4">
          <div className="h-8 animate-pulse rounded-lg bg-muted" />
          <div className="h-9 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
