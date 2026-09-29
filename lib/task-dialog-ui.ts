import { cn } from "cn";

/**
 * Shell of the create/edit task dialog.
 * `overflow-y-auto` alone computes to overflow-x: auto, which enables horizontal
 * panning; pair it with overflow-x-hidden and a viewport-capped max-width.
 */
export function taskDialogContentClassName(className?: string): string {
  return cn(
    "max-h-[90vh] min-w-0 max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto overscroll-x-none touch-pan-y sm:max-w-2xl",
    className
  );
}

export function taskDialogHeaderClassName(className?: string): string {
  return cn("min-w-0 pr-8 wrap-anywhere", className);
}

export function taskFormClassName(className?: string): string {
  return cn("grid min-w-0 max-w-full gap-4 wrap-anywhere", className);
}

export function taskFormFieldClassName(className?: string): string {
  return cn("grid min-w-0 gap-2", className);
}

export function taskFormPairClassName(className?: string): string {
  return cn("grid min-w-0 gap-3 sm:grid-cols-2", className);
}

export function taskDescriptionClassName(className?: string): string {
  return cn("min-h-48 min-w-0 max-w-full wrap-anywhere font-mono text-sm", className);
}

export function taskDialogListRowClassName(className?: string): string {
  return cn("flex min-w-0 flex-wrap items-start justify-between gap-2", className);
}

export function taskDialogListLabelClassName(className?: string): string {
  return cn("min-w-0 wrap-anywhere", className);
}

export function taskActivityListClassName(className?: string): string {
  return cn("grid max-h-48 min-w-0 gap-2 overflow-x-hidden overflow-y-auto overscroll-x-none pr-1", className);
}

export function taskActivityMetaClassName(className?: string): string {
  return cn("flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1", className);
}

export function taskActivityValueClassName(className?: string): string {
  return cn("mt-1 min-w-0 text-muted-foreground wrap-anywhere", className);
}

export function taskDialogSelectTriggerClassName(className?: string): string {
  return cn("w-full min-w-0 max-w-full", className);
}
