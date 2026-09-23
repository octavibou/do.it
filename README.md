# do.it

Backlog único de Octavi: proyectos, humanos y bots. Sustituye webhooks de Notion Automation.

## Qué incluye el MVP

- Lista de proyectos
- Kanban por proyecto: **Bandeja | En curso | Revisión | Hecho** (arrastrar o botones)
- Asignado `human` o `bot` (bot concreto)
- Vista de trabajo de cada bot (tareas **En curso**)
- Webhook al pasar a En curso si el asignado es un bot
- Auth mínima: contraseña compartida (`APP_PASSWORD`)

## v2 (campos must-have)

- Fecha límite `due_at` (visible y filtrable; **nunca** mueve el estado)
- Dependencias duras: no se pasa a En curso si hay bloqueadores sin Hecho, salvo **Forzar inicio (override)**
- Archivo suave (`archived_at`); el tablero las oculta y hay filtro Archivadas
- Auditoría en `task_events` (creación, estado, asignado, prioridad, fecha, archivo, deps, webhook, override)
- Confirmación al salir de Bandeja: el estado no se mueve por urgencia; urgente ≠ En curso
- Anti-duplicados al crear (usar existente o crear de todas formas)
- Cuerpo más grande, con plantilla por qué / DoD / pasos / deps / enlaces
- Prioridad en UI: **urgente | alta | normal | baja** (en DB sigue `urgent|high|medium|low`)

## Arranque

```bash
cp .env.example .env.local
npm install
npm run dev
```

Variables (no commitear secretos):

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bxvhabbuxwsdwpfeklfc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave anon (auth/cliente; el hub no lee datos con ella) |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor: Server Actions y Route Handlers |
| `APP_PASSWORD` | contraseña única de la app |

Aplica las migraciones en el editor SQL del proyecto Supabase `bxvhabbuxwsdwpfeklfc` (otra cuenta; este repo no puede alcanzarla):

1. `supabase/migrations/001_init.sql` — ya aplicada en producción
2. **`supabase/migrations/002_v2_must_have.sql` — hay que ejecutarla a mano** (columnas `due_at`/`archived_at`, tablas `task_dependencies` y `task_events`)

El SQL crea tablas, RLS (sin políticas para `anon`/`authenticated`) y el seed:

| Proyecto | Bot | id |
| --- | --- | --- |
| Leadflow | Flow | `7d765d6a-63aa-4d4d-9914-0b3d26dee739` |
| Personal | Home | `728f5795-a9b8-4253-8ffd-4dbd25f57a0c` |
| Monetiza | Mint | `776da315-252f-4d4e-855f-a0c17be05120` |
| Diselo | Dial | `64a98027-a9f3-4c87-afe6-51ae8e7512e5` |

Las URL de webhook empiezan vacías. Edítalas en **Ajustes**.

## Auth

No hay registro. Octavi entra en `/login` con `APP_PASSWORD`. La sesión es una cookie httpOnly firmada con HMAC. Sin esa variable, la app no queda abierta en internet: el login no acepta nadie.

Los datos de negocio solo se leen/escriben en el servidor con la service role. RLS está activo y no hay policies para el cliente.

## Webhook `task.doing`

Se dispara cuando:

1. el estado pasa a `doing`, y el asignado es `bot`, o
2. el asignado pasa a `bot` mientras la tarea ya está en `doing`.

`POST` a `bots.webhook_url` con JSON:

```json
{
  "event": "task.doing",
  "task": {
    "id": "…",
    "project_id": "…",
    "title": "…",
    "description": null,
    "status": "doing",
    "assignee_type": "bot",
    "bot_id": "7d765d6a-63aa-4d4d-9914-0b3d26dee739",
    "priority": "high",
    "created_at": "…",
    "updated_at": "…",
    "started_at": "…"
  },
  "project": { "id": "…", "slug": "leadflow", "name": "Leadflow" },
  "bot": { "id": "…", "name": "Flow", "project_id": "…" }
}
```

Si el POST falla (red, timeout 10s, HTTP no 2xx) o no hay URL:

- la tarea **sigue en En curso**
- el error se guarda en `tasks.webhook_error` y se muestra en la tarjeta
- se puede reintentar desde la UI

Si el POST va bien, se limpia el error y se guarda `webhook_fired_at`.

## API

Todas las rutas (menos `/login`) exigen cookie de sesión.

```http
GET /api/bots/:id/current
```

Respuesta: el bot y sus tareas en `doing`.

El resto del CRUD va por Server Actions (`app/actions`).

## Deploy (Vercel)

Proyecto `do-it`, framework Next.js. Configura las env vars del `.env.example` y aplica la migración. `npm run build` tiene que pasar sin secretos: las páginas no pegan a Supabase en build time.
