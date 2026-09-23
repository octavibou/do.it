import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4">
      <h1 className="text-2xl font-medium tracking-tight">No está</h1>
      <p className="text-sm text-muted-foreground">Esa ruta no existe.</p>
      <Link href="/" className="text-sm underline-offset-4 hover:underline">
        Volver a proyectos
      </Link>
    </div>
  );
}
