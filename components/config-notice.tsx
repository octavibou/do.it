import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { missingEnvNames } from "@/lib/supabase/admin";

export function ConfigNotice({
  title = "Falta configuración",
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  const missing = missingEnvNames();

  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {detail ??
          "Añade las variables de entorno en Vercel (o en .env.local) y aplica la migración SQL."}
        {missing.length > 0 ? (
          <span className="mt-2 block font-mono text-xs text-foreground">
            {missing.join(", ")}
          </span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
