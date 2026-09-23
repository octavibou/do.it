import { LoginForm } from "@/components/login-form";
import { isAuthConfigured } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const nextParam = params.next;
  const nextPath = typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/";

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-background p-6 ring-1 ring-foreground/10">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">do.it</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">Entrar</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Contraseña compartida de la app. Solo Octavi, de momento.
        </p>
        <LoginForm nextPath={nextPath} authConfigured={isAuthConfigured()} />
      </div>
    </div>
  );
}
