import { isDoneColumn, kanbanColumnClassName } from "@/lib/kanban-ui";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function BoardSkeleton({ projectName }: { projectName?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-4" aria-busy="true" aria-live="polite">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Proyecto</p>
        <h1 className="text-2xl font-medium tracking-tight">{projectName ?? "Cargando tablero…"}</h1>
        <p className="mt-1 max-w-xl text-xs text-muted-foreground">Preparando columnas y tarjetas.</p>
      </div>
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:grid md:grid-cols-4 md:px-0">
        {STATUS_ORDER.map((status) => {
          const compact = isDoneColumn(status);
          return (
            <section key={status} className={kanbanColumnClassName(status)}>
              <header className={cn("mb-3 flex items-center justify-between px-1", compact && "mb-2")}>
                <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
                <span className="text-xs text-muted-foreground">…</span>
              </header>
              <div className={cn("flex flex-1 flex-col gap-2", compact && "gap-1")}>
                {compact ? (
                  <>
                    <div className="h-7 animate-pulse rounded-lg bg-background/90 ring-1 ring-emerald-200/80 dark:bg-background/55 dark:ring-emerald-800/50" />
                    <div className="h-7 animate-pulse rounded-lg bg-background/90 ring-1 ring-emerald-200/80 dark:bg-background/55 dark:ring-emerald-800/50" />
                    <div className="h-7 animate-pulse rounded-lg bg-background/90 ring-1 ring-emerald-200/80 dark:bg-background/55 dark:ring-emerald-800/50" />
                    <div className="h-7 animate-pulse rounded-lg bg-background/90 ring-1 ring-emerald-200/80 dark:bg-background/55 dark:ring-emerald-800/50" />
                  </>
                ) : (
                  <>
                    <div className="h-24 animate-pulse rounded-xl bg-background ring-1 ring-foreground/10" />
                    <div className="h-20 animate-pulse rounded-xl bg-background ring-1 ring-foreground/10" />
                    <div className="h-16 animate-pulse rounded-xl bg-background ring-1 ring-foreground/10" />
                  </>
                )}
              </div>
            </section>
          );
        })}
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
