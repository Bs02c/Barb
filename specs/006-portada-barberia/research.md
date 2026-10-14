# Investigación: portada de la barbería y estilo oscuro (spec 006)

Decisiones técnicas para cumplir la spec sin dependencias ni servicios nuevos (constitución VII).

## R1. Permiso del admin sobre su barbería

- **Decisión:** privilegio de columna `grant update (description, address) on public.barbershops to authenticated` y una política nueva `barbershops_update` para `authenticated` con `using` y `with check` = `id = (select private.current_barbershop_id())`.
- **Razón:**
  - El privilegio de columna impide tocar `name`, `subdomain`, `timezone` e `is_active` (error `42501`) aunque la política deje pasar la fila.
  - La política limita la fila a la barbería del admin.
  - `private.current_barbershop_id()` ya devuelve null para el super admin, para un usuario sin perfil y para una barbería desactivada, así que ninguno de ellos puede modificar nada (0 filas). No hace falta una regla aparte para el super admin (FR-013).
  - `service_role` no recibe UPDATE (FR-014).
- **Alternativas descartadas:**
  - **Función `SECURITY DEFINER` que actualice los dos campos:** salta RLS y obliga a repetir la comprobación de barbería dentro de la función. El privilegio de columna con política es el patrón que ya usa `appointments` (`status`, `cancelled_at`).
  - **Tabla aparte `barbershop_profiles`:** una tabla más con su RLS y su matriz para dos campos. Sin beneficio.

## R2. Restricciones de los textos nuevos

- **Decisión:** `check` en la base, además de Zod (constitución III):
  - `description` de barbería: null, o 1–160 caracteres, sin espacios al principio ni al final y sin saltos de línea.
  - `address`: igual, con 1–200 caracteres.
  - `description` de servicio: igual, con 1–200 caracteres.
  - Forma de cada `check`: `col is null or (char_length(col) between 1 and N and col = btrim(col) and col !~ '[\r\n]')`.
- **Razón:**
  - "Vacío" se guarda como `null`, nunca como `''`, así que la portada solo comprueba null.
  - La base es la última barrera aunque falle Zod.
- **Alternativa descartada:** solo Zod. Contradice la constitución III.

## R3. Horario de la barbería

- **Decisión:** se deriva de `barber_schedules` de los barberos **activos**, sin guardarlo. Para cada día ISO (1–7), la apertura es el `start_time` mínimo y el cierre, el `end_time` máximo. Se lee en la **misma transacción** que el catálogo (`getBookingCatalog`), sustituyendo el `EXISTS` actual por la lectura de los tramos de barberos activos. De los tramos sale también `bookable` (hay al menos un tramo).
- **Razón:**
  - No hay consulta extra ni una conexión más del pool (revisión spec 005, PERF-001).
  - El volumen es pequeño: barberos × 7 días × pocos tramos.
  - Hay una sola regla de "se puede reservar" (revisión spec 004, MAINT-001).
- **Alternativa descartada:** un `group by weekday` con `min`/`max` en SQL. Devuelve menos filas, pero añade una consulta agregada distinta. Con el volumen del MVP no compensa.

## R4. Estado de apertura

- **Decisión:** dos funciones puras en `src/lib/storefront/hours.ts`:
  - `weeklyHours(slots)` devuelve 7 días, cada uno con `{ weekday, open: "HH:MM", close: "HH:MM" }` o `null`.
  - `openingStatus(hours, now, timezone)` devuelve uno de estos estados:
    - `open` con hora de cierre;
    - `opensToday` con hora de apertura;
    - `closed` con el próximo día y hora de apertura, o sin próximo si no hay ningún horario.
- **Zona horaria:** la conversión de `now` a fecha y hora local se hace solo con `src/lib/time.ts` (constitución IV). Hay que añadir allí, si falta, una función para obtener la hora local `HH:MM` de un instante.
- **Comparaciones:** son de cadenas `HH:MM` (las horas de la base son `time` sin zona, en hora local de la barbería). Una barbería abre en `[open, close)`: a la hora exacta de cierre ya está cerrada.
- **Próximo día:** se buscan los 7 días siguientes, con "mañana" para el día siguiente y el nombre del día para los demás.
- **Razón:** son lógica pura, probada con Vitest sin base de datos (incluido el cambio de día en la zona de Bogotá y en una zona con horario de verano, como ya hace `time.test.ts`).

## R5. Enlace "Ver mapa"

- **Decisión:** `https://www.google.com/maps/search/?api=1&query=` + `encodeURIComponent(address)`, con `target="_blank"` y `rel="noopener noreferrer"`.
- **Razón:**
  - Es la URL documentada de Google Maps para búsquedas.
  - No necesita clave de API ni guardar nada (FR-005).
  - `encodeURIComponent` codifica `#`, tildes y eñes.
- **Alternativa descartada:** guardar una URL del mapa. Es un campo más, y una URL que escribe el admin se convierte en un enlace arbitrario en la página pública.

## R6. Tema oscuro

- **Decisión:**
  - Cambiar solo los valores de `:root` en `src/app/globals.css` a los de `DESIGN.md` 0.2.0, manteniendo los nombres de variables de shadcn:
    - `primary` y `selection` pasan a cobre;
    - `primary-foreground` y `selection-foreground` pasan a texto oscuro;
    - `accent` (el hover de shadcn) pasa a `muted`.
  - Añadir los tokens `link` y `destructive-text`, y el `color-scheme: dark` del navegador.
  - Radios: `md` 10 px y `lg` 14 px.
  - Después, revisar componente por componente los usos que dependían del contraste del tema claro: textos en `text-selection`, el botón principal que antes era carbón, errores en `text-destructive` y bordes.
- **Razón:** shadcn lee todo de esas variables, así que el cambio se propaga a toda la app con poco código.
- **Riesgo:** clases con colores literales (`text-white`, `bg-white`, `text-black` o colores de Tailwind fijos). El agente `frontend` las busca y las sustituye por tokens. El escaneo `axe` de los E2E es la red de seguridad.

## R7. Textura de la portada

- **Decisión:** CSS puro: `repeating-linear-gradient` de franjas con `card` y `muted`, más un degradado que la funde con `background`. Lleva `aria-hidden` y no va en una imagen.
- **Razón:** no hay petición de red ni imágenes que subir. Es la única excepción a "sin degradados" que admite `DESIGN.md`.

## R8. Renderizado y caché

- **Decisión:** la portada sigue siendo dinámica por petición, como hoy (lee la base con `withService` y depende de la hora actual), sin caché de datos. `generateMetadata` y la página comparten `getPublicBarbershop` y `getBookingCatalog` con `cache()`.
- **Razón:** el estado de apertura cambia con la hora, y la portada tiene que reflejar al recargar lo que el admin acaba de guardar (SC-003).
- **Rendimiento:** la portada hace las mismas dos transacciones que `/reservar` en el paso 1 (barbería y catálogo). SC-005 se mide con `npm run perf:ttfb`, añadiendo la ruta `/`.

## R9. Panel "Mi barbería"

- **Decisión:**
  - Ruta `/admin/mi-barberia`: segmento `mi-barberia` dentro de `(panel)`, con un ítem nuevo en `admin-nav.tsx` (icono `Store` de Lucide).
  - Lectura con `withAdmin` en `src/lib/admin/queries.ts`.
  - Server action `updateBarbershopInfo` en `src/lib/admin/actions.ts`, con el patrón de siempre: `requireAdmin` → Zod → `withAdmin` → `toDbError`.
  - El `update` filtra **también** por `barbershop.id` del contexto (defensa en profundidad; RLS ya lo limita).
  - Si el `update` afecta a 0 filas, responde "No tienes permiso para hacer esto."
- **Razón:** es el mismo patrón que el resto del panel, sin piezas nuevas.

## R10. Agentes de desarrollo y contrato

- `database`: migración `db/migrations/0002_portada_barberia.sql`, pgTAP (`00_structure`, `01_isolation`, `04_constraints`) y seed.
- `frontend`: `globals.css`, la portada `src/app/s/[subdomain]/page.tsx` con sus componentes en `src/components/storefront/`, la página `mi-barberia`, el campo de descripción en `services-manager.tsx`, `admin-nav.tsx` y los E2E.
- Agente principal:
  - `src/lib/storefront/` (cálculo del horario y del estado de apertura);
  - `src/lib/time.ts`;
  - `src/lib/booking/queries.ts`;
  - `src/lib/barbershops.ts`;
  - `src/lib/admin/` (consultas, acciones y esquemas);
  - `src/lib/db/schema.ts`;
  - los tests de integración.
- El contrato entre ellos está en `contracts/`.
