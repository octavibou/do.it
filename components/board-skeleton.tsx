import { STATUS_LABELS, STATUS_ORDER } from "@/lib/labels";

export function BoardSkeleton({ projectName }: { projectName?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-4" aria-busy="true" aria-live="polite">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Proyecto</p>
        <h1 className="text-2xl font-medium tracking-tight">{projectName ?? "Cargando tablero…"}</h1>
        <p className="mt-1 max-w-xl text-xs text-muted-foreground">Preparando columnas y tarjetas.</p>
      </div>
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:grid md:grid-cols-4 md:px-0">
        {STATUS_ORDER.map((status) => (
          <section key={status} className="flex min-h-72 w-[min(100%,20rem)] shrink-0 flex-col rounded-2xl bg-muted/60 p-3 md:w-auto">
            <header className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
              <span className="text-xs text-muted-foreground">…</span>
            </header>
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-24 animate-pulse rounded-xl bg-background ring-1 ring-foreground/10" />
              <div className="h-20 animate-pulse rounded-xl bg-background ring-1 ring-foreground/10" />
              <div className="h-16 animate-pulse rounded-xl bg-background ring-1 ring-foreground/10" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-2xl bg-background ring-1 ring-foreground/10"
        />
      ))}
    </div>
  );
}

export function PageSkeleton({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}) {
  return (
    <div className="grid gap-6" aria-busy="true" aria-live="polite">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{kicker}</p>
        <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
      </div>
      <CardsSkeleton />
    </div>
  );
}
