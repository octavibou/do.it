# do.it

Backlog único de Octavi: proyectos, humanos y bots. Sustituye webhooks de Notion Automation.

## Qué incluye el MVP

- Lista de proyectos
- Kanban por proyecto: **Bandeja | En curso | Revisión | Hecho** (arrastrar o botones)
- Asignado `human` o `bot` (bot concreto)
- Vista de trabajo de cada bot (tareas **En curso**)
- Webhook al pasar a En curso si el asignado es un bot
- Auth mínima: contraseña compartida (`APP_PASSWORD`)
- Bot API: cada bot gestiona las tareas de **su proyecto** (listar, crear en Inbox, editar, mover estado, asignar, archivar) con `Authorization: Bearer <BOT_API_TOKEN>`

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
| `BOT_API_TOKEN` | secreto compartido para la Bot API (Bearer). No hace falta cookie |

Aplica las migraciones en el editor SQL del proyecto Supabase `bxvhabbuxwsdwpfeklfc` (otra cuenta; este repo no puede alcanzarla):

1. `supabase/migrations/001_init.sql` — ya aplicada en producción
2. **`supabase/migrations/002_v2_must_have.sql` — hay que ejecutarla a mano** (columnas `due_at`/`archived_at`, tablas `task_dependencies` y `task_events`)
3. **`supabase/migrations/003_board_open_indexes.sql` — hay que ejecutarla a mano** (índices para abrir el tablero: tareas activas por proyecto, archivadas y dependencias por `blocker_task_id`). Sin ella la app funciona; las consultas del Kanban son más lentas.
4. **`supabase/migrations/004_list_aggregates.sql` — hay que ejecutarla a mano** (función `active_task_status_counts()` para la home e índice de tareas en curso de bots). Sin ella la lista de proyectos usa el fallback fila a fila.

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

Los bots (Flow, Home, Mint, Dial) llaman `/api/bots/*` con `Authorization: Bearer $BOT_API_TOKEN` (secreto compartido en Vercel; no se muestra en Ajustes). No hace falta cookie. `GET /api/bots/:id/current` también acepta la cookie de sesión.

Los datos de negocio solo se leen/escriben en el servidor con la service role. RLS está activo y no hay policies para el cliente.

## Webhook `task.doing`

Se dispara cuando (misma regla en la UI y en `PATCH` de la Bot API):

1. el estado pasa a `doing`, y el asignado es `bot`, o
2. el asignado pasa a `bot` mientras la tarea ya está en `doing`.

El POST va a `bots.webhook_url` del asignado, no del caller. Si un bot se autoasigna y mueve a `doing`, recibe su propio webhook; no se filtran auto-bucles.

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

La UI (y `GET /api/bots/:id/current` como alternativa) sigue usando la cookie de sesión. Las rutas `/api/bots/*` también aceptan Bearer sin cookie.

Auth de bots:

```http
Authorization: Bearer $BOT_API_TOKEN
```

`:id` tiene que ser un bot real. El bot solo ve, crea y muta tareas de su `project_id`. Una tarea de otro proyecto responde **404**. En CREATE el estado es siempre `inbox`. En PATCH el bot tiene control total de las tareas de su proyecto (estado, asignado, archivo y campos normales).

```http
GET /api/bots/:id/current
GET /api/bots/:id/tasks?status=inbox,doing&include_archived=false
POST /api/bots/:id/tasks
GET /api/bots/:id/tasks/:taskId
PATCH /api/bots/:id/tasks/:taskId
```

`status` es opcional (lista separada por comas: `inbox|doing|review|done`). `include_archived` vale `false` por defecto.

`POST` crea una tarea en el proyecto del bot. Campos JSON: `title` (obligatorio), `description`, `priority` (`low|medium|high|urgent`), `due_at` (ISO o `null`). Por defecto `status=inbox`, `assignee_type=human`, `bot_id=null`. Se puede asignar a **este** bot con `assignee_type=bot` y/o `bot_id` igual al `:id` del path. Rechaza `status` distinto de `inbox`, archivo, otro proyecto u otro bot. Escribe `task_events` con `action=create` y `actor=bot:<nombre>`. No dispara webhook `task.doing`.

Si el título es muy parecido a una tarea abierta del mismo proyecto (misma regla anti-dup que la UI), responde **409** con `duplicates`. No hay `forceCreate` por API: usa GET/PATCH de la existente.

`PATCH` acepta cualquier combinación de:

| Campo | Valores | Notas |
| --- | --- | --- |
| `title` | string no vacío | |
| `description` | string o `null` | |
| `priority` | `low\|medium\|high\|urgent` o `null` | |
| `due_at` / `dueAt` | ISO-8601 o `null` | |
| `status` | `inbox` \| `doing` \| `review` \| `done` | Misma máquina de estados que la UI. Pasar a `doing` respeta dependencias duras (bloqueadores sin `done` → **409** con `blockers`). No hay diálogo de confirmación al salir de Inbox: el PATCH **es** la confirmación. No hay `overrideStart` por API. |
| `assignee_type` / `assigneeType` | `human` \| `bot` | `human` limpia `bot_id`. `bot` exige `bot_id` (si se omite, se asigna al bot del path `:id`). |
| `bot_id` / `botId` | UUID o `null` | Solo un bot del **mismo** `project_id` que la tarea. Otro proyecto → **403**. `bot_id` inexistente → **400**. |
| `archived_at` / `archivedAt` | ISO-8601 o `null` | `null` restaura. Cualquier ISO válido archiva (el servidor pone `archived_at = now()`, no el timestamp enviado). |

Campos desconocidos → **400**. Valores de enum inválidos → **400**. Tarea de otro proyecto → **404**.

Los `task_events` usan las mismas `action` que la UI (`status_change`, `assignee_change`, `priority_change`, `update`, `archive`) con `actor=bot:<nombre>`.

Webhook `task.doing`: un PATCH que deja la tarea en `doing` con asignado `bot` dispara el mismo webhook que la UI (`shouldDispatchDoingWebhook`: entra en `doing` o el asignado pasa a `bot` estando ya en `doing`). Si Flow se asigna la tarea y la mueve a `doing`, Flow recibe el POST; **no** se suprimen auto-bucles. CREATE sigue sin disparar webhook (siempre Inbox).

Ejemplos:

```bash
BASE=https://tu-dominio.vercel.app
BOT=7d765d6a-63aa-4d4d-9914-0b3d26dee739   # Flow / Leadflow
TASK=10a00000-0000-4000-8000-000000000001

curl -sS "$BASE/api/bots/$BOT/tasks?status=inbox,doing" \
  -H "Authorization: Bearer $BOT_API_TOKEN"

curl -sS -X POST "$BASE/api/bots/$BOT/tasks" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Inbox desde Flow","description":"## Por qué\nEl bot crea la tarea.","priority":"medium"}'

curl -sS -X PATCH "$BASE/api/bots/$BOT/tasks/$TASK" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"## Por qué\nActualizar el cuerpo desde Flow."}'

# Mover a En curso y asignarse
curl -sS -X PATCH "$BASE/api/bots/$BOT/tasks/$TASK" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"doing","assignee_type":"bot","bot_id":"'"$BOT"'"}'

# Devolver a humano y marcar Hecho
curl -sS -X PATCH "$BASE/api/bots/$BOT/tasks/$TASK" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"done","assignee_type":"human"}'

# Archivar / restaurar
curl -sS -X PATCH "$BASE/api/bots/$BOT/tasks/$TASK" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"archived_at":"2026-09-25T10:00:00.000Z"}'

curl -sS -X PATCH "$BASE/api/bots/$BOT/tasks/$TASK" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"archived_at":null}'
```

Cuerpos PATCH de ejemplo:

```json
{ "status": "review" }
{ "status": "doing", "assignee_type": "bot" }
{ "assignee_type": "human" }
{ "assignee_type": "bot", "bot_id": "7d765d6a-63aa-4d4d-9914-0b3d26dee739" }
{ "title": "Nuevo título", "priority": "urgent", "due_at": "2026-10-01T12:00:00.000Z" }
{ "archived_at": null }
```

`GET /api/bots/:id/current` sigue devolviendo el bot y sus tareas en `doing` (Bearer o cookie).

El resto del CRUD de la UI va por Server Actions (`app/actions`).

## Deploy (Vercel)

Proyecto `do-it`, framework Next.js. Configura las env vars del `.env.example` y aplica la migración. `npm run build` tiene que pasar sin secretos: las páginas no pegan a Supabase en build time.
