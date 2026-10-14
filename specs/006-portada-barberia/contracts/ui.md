# Contrato de interfaz (agente `frontend`)

Fuente de verdad visual: `DESIGN.md` 0.2.0. Maqueta aprobada por el usuario: acento cobre (artifact "La Barbería: azul o cobre", variante B).

## Portada `src/app/s/[subdomain]/page.tsx`

Orden (FR-001), en una columna centrada (`max-w-md` en móvil; puede ser más ancha en escritorio):
1. **Portada:** textura (R7, `aria-hidden`), etiqueta "Barbería", `h1` con el nombre (Playfair), descripción (si hay), estado de apertura (texto de `openingStatus`) y dirección con "Ver mapa" (si hay). Las líneas sin dato no se pintan.
2. **Botón principal** "Reservar lo más pronto" → `/reservar`. Solo si `bookable`.
3. **Servicios** (`h2`): una tarjeta por servicio (DESIGN.md, "Tarjeta de servicio · En la portada"). El botón "Reservar" lleva nombre accesible completo: `aria-label="Reservar Corte clásico"`. Sin servicios: "Esta barbería aún no tiene servicios para reservar".
4. **Horario** (`h2`): lista de 7 filas; la de hoy resaltada, con `aria-current="date"` y "(hoy)" en el texto (el color no es la única señal).
5. **Pie:** enlace "Política de tratamiento de datos".

Metadatos (FR-007): `title` = nombre; `description` = descripción de la barbería o "Reserva tu cita en [nombre]."; indexable.

## Tema (FR-008)

- `src/app/globals.css`: valores de `DESIGN.md` 0.2.0 (R6); `color-scheme: dark` en `html`.
- Sustituir los colores literales por tokens. Ningún `bg-white`, `text-black` ni color fijo de Tailwind para texto o fondo.

## Panel

- `admin-nav.tsx`: ítem "Mi barbería" (`/admin/mi-barberia`, icono `Store`), después de "Bloqueos".
- `src/app/s/[subdomain]/admin/(panel)/mi-barberia/page.tsx`:
  - `h1` "Mi barbería";
  - nombre en solo lectura;
  - campo "Descripción" (textarea de una línea lógica, `maxLength` 160, contador "n/160") y campo "Dirección" (`input`, `maxLength` 200);
  - botón "Guardar";
  - errores por campo con `aria-describedby` (componentes de `src/components/forms/`);
  - texto de ayuda: "Se muestran en la página pública de tu barbería. Déjalos vacíos para ocultarlos."
- `services-manager.tsx`: campo opcional "Descripción" (`maxLength` 200) en crear y editar.

## E2E (`tests/e2e/`)

- `booking.spec.ts`: empieza en la portada. Pulsa "Reservar lo más pronto" (antes "Reservar cita") y sigue igual.
- Nuevo `storefront.spec.ts`:
  - la portada de "labarberia" muestra descripción, dirección, servicios con descripción y 7 filas de horario;
  - "Reservar Corte clásico" lleva al paso 2 con ese servicio;
  - la portada de "elcorte" no muestra líneas vacías;
  - `axe` sin violaciones en móvil y escritorio.
- Nuevo caso en `admin-agenda.spec.ts` o archivo `admin-barbershop.spec.ts`: el admin guarda descripción y dirección, ve "Datos guardados." y la portada las muestra; `axe` en `/admin/mi-barberia`. El test restaura los valores originales al terminar.
