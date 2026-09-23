"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isAuthConfigured,
  verifyPassword,
} from "@/lib/auth";

export async function loginAction(formData: FormData): Promise<{ error: string } | void> {
  if (!isAuthConfigured()) {
    return { error: "Falta APP_PASSWORD en las variables de entorno." };
  }

  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!verifyPassword(password)) {
    return { error: "Contraseña incorrecta." };
  }

  const token = createSessionToken();
  if (!token) {
    return { error: "No se pudo crear la sesión." };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
