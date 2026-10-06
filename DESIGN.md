---
# DESIGN.md — Reservas para barberías
# Estado: APROBADO por el usuario (2026-10-05) y aplicado en src/app/globals.css y src/app/layout.tsx (fase 3).
# Revisión 1 del usuario: "Lo más pronto" en el paso 2, "Número de contacto" en el paso 4, columna Barbero en la agenda.
# Implementación: el token `accent` (cobre) de este archivo se llama `selection` en CSS/Tailwind
# (bg-selection, text-selection-foreground), porque en shadcn `accent` es el fondo sutil de hover.
# Fuente de verdad del diseño (ADR-012). Generado con UI UX Pro Max y ajustado a mano (ver "Origen").
version: 0.1.0
mode: light # modo oscuro fuera del MVP
colors:
  background: "#FAF8F5" # blanco cálido
  foreground: "#1C1917" # carbón
  card: "#FFFFFF"
  card-foreground: "#1C1917"
  primary: "#1C1917" # botones principales
  on-primary: "#FFFFFF"
  accent: "#B45309" # cobre: selección, enlaces, foco
  on-accent: "#FFFFFF"
  muted: "#F3EEE8"
  muted-foreground: "#57534E"
  border: "#E7E1D9" # separadores y tarjetas (decorativo)
  input: "#8C8279" # borde de campos y controles (≥ 3:1)
  ring: "#B45309"
  destructive: "#B91C1C"
  on-destructive: "#FFFFFF"
  success: "#15803D" # disponible / confirmada
  on-success: "#FFFFFF"
  unavailable: "#EFEBE6" # horario no disponible (fondo)
  unavailable-foreground: "#57534E"
typography:
  sans: "Inter" # todo el texto, formularios y panel
  display: "Playfair Display" # solo el nombre de la barbería y el H1 de páginas públicas
  scale: # rem
    xs: 0.75
    sm: 0.875
    base: 1 # mínimo para texto de formularios en móvil (evita zoom en iOS)
    lg: 1.125
    xl: 1.25
    2xl: 1.5
    3xl: 1.875
  weights: [400, 500, 600, 700]
  line-height: { body: 1.5, heading: 1.2 }
radius:
  sm: 6px
  md: 8px # por defecto: botones, campos, tarjetas
  lg: 12px # diálogos y hojas inferiores
  full: 9999px # chips de horario
spacing: tailwind-default # escala de 4 px
shadow:
  sm: "0 1px 2px rgb(28 25 23 / 0.06)"
  md: "0 4px 12px rgb(28 25 23 / 0.08)"
motion:
  duration: { fast: 150ms, base: 200ms }
  easing: "cubic-bezier(0.2, 0, 0, 1)"
  reduced-motion: respetar `prefers-reduced-motion` (sin animación)
breakpoints: { sm: 640px, md: 768px, lg: 1024px }
touch-target: 44px
---

# Sistema de diseño: Reservas para barberías

## Intención

Una plataforma que usan muchas barberías distintas. El diseño debe ser **sobrio, cálido y muy legible**, con un toque clásico de barbería, sin competir con el logo y la identidad de cada barbería. Prioridad: que reservar desde el celular sea rápido y sin errores.

- **Estilo:** minimalista y suizo (UI UX Pro Max: bajo coste, bajo riesgo de accesibilidad). Mucho espacio en blanco, jerarquía clara, cuadrícula.
- **Personalidad:** carbón + cobre sobre blanco cálido (cuero, madera y metal de una barbería clásica), con un serif clásico solo en títulos públicos.
- **Dos caras:** la página pública de la barbería (más cálida, usa el serif) y el panel del admin (más denso, solo sans).

## Color

| Uso | Token | Contraste medido |
|---|---|---|
| Texto sobre fondo | `foreground` / `background` | 16,5:1 |
| Botón principal | `on-primary` / `primary` | 17,5:1 |
| Botón o chip seleccionado en cobre | `on-accent` / `accent` | 5,0:1 |
| Enlace cobre sobre fondo | `accent` / `background` | 4,7:1 |
| Texto secundario | `muted-foreground` / `background` | 7,2:1 |
| Borde de campos | `input` / `background` | 3,6:1 (mínimo 3:1 para controles) |
| Error | `on-destructive` / `destructive` | 6,5:1 |
| Disponible / confirmada | `on-success` / `success` | 5,0:1 |
| Horario no disponible | `unavailable-foreground` / `unavailable` | 6,4:1 |

Reglas:
- **Un solo color de acento (cobre)** para lo seleccionado y lo interactivo. El botón principal es carbón, no cobre: así el cobre marca "lo que elegiste".
- El color **nunca es la única señal**: un horario no disponible además va tachado y sin borde; un error lleva icono y texto.
- Los colores personalizados por barbería están en el Roadmap; cuando lleguen, se validará su contraste contra estos mínimos.

## Tipografía

- **Inter** para todo: texto, formularios, botones, panel. Cargada con `next/font` (sin peticiones a Google desde el navegador del cliente).
- **Playfair Display** solo para el nombre de la barbería y el título principal de páginas públicas. Nunca en párrafos ni formularios.
- Texto mínimo de 16 px en campos de formulario en móvil.
- Fechas y horas en formato local de Colombia (`es-CO`, por ejemplo "lun 13 oct, 10:30 a. m."), siempre en la zona horaria de la barbería.

## Componentes (shadcn/ui)

- **Botón principal:** fondo `primary`, texto blanco, alto mínimo 44 px, radio `md`. Uno por pantalla.
- **Botón secundario:** borde `input`, fondo transparente.
- **Campos:** etiqueta visible siempre encima (nunca solo placeholder), borde `input`, foco con anillo cobre de 2 px. `inputmode="tel"` para WhatsApp y `type="email"` para correo. Error debajo del campo, en `destructive`, con icono.
- **Tarjeta de servicio / barbero:** fondo `card`, borde `border`, radio `md`; seleccionada: borde de 2 px `accent` y marca de verificación.
- **Chip de horario:** radio `full`, alto 44 px.
  - Disponible: borde `input`, fondo `card`.
  - Seleccionado: fondo `accent`, texto `on-accent`.
  - No disponible: fondo `unavailable`, texto `unavailable-foreground` tachado, no clicable.
- **Indicador de pasos** (reserva): "Paso 2 de 4" en texto + barra de progreso en `accent`. Sin colores distintos por paso.
- **Estados de envío:** botón con "Reservando…" y deshabilitado mientras se envía; después, pantalla de confirmación clara o error en línea.
- **Iconos:** Lucide (ya instalado), 20 px, trazo 1,75. Nunca emojis como iconos.

## Patrones

- **Reserva por pasos** (divulgación progresiva): 1 servicio → 2 barbero → 3 fecha y hora → 4 datos y consentimiento → confirmación. Un objetivo por pantalla; el resumen de lo elegido siempre visible arriba.
  - **Paso 2:** primera opción **"Lo más pronto"** (icono de reloj; "El primer horario libre con cualquier barbero"), luego una tarjeta por barbero con su nombre. Mostrar la fecha más próxima de cada barbero está en el Roadmap.
  - **Paso 4:** campos "Nombre", **"Número de contacto"** (celular, `inputmode="tel"`) y "Correo", más la casilla de autorización de datos.
- **Panel del admin:** navegación lateral en escritorio y barra inferior en móvil; tablas simples con filas de 44 px; acciones destructivas con confirmación.
  - **Agenda:** columnas Hora, **Barbero**, Cliente, Servicio, Estado y acción; por defecto, todos los barberos del día.
- **Vacíos y errores:** mensaje breve que explica qué pasó y qué hacer ("Este barbero no tiene horarios esta semana. Prueba con otro barbero.").

## Movimiento

- Solo transiciones CSS de 150–200 ms en hover, foco y cambio de selección. Sin librerías de animación (GSAP descartado: dependencia innecesaria, constitución VII).
- Con `prefers-reduced-motion`, sin animaciones.
- El pulido de microinteracciones (Emil Kowalski, Impeccable) está en el Roadmap.

## Accesibilidad (checklist antes de entregar cada pantalla)

- [ ] Contraste de texto ≥ 4,5:1 y de bordes de controles ≥ 3:1 (tokens de arriba).
- [ ] Foco visible en todo elemento interactivo; navegación completa con teclado.
- [ ] Etiquetas en todos los campos; errores asociados al campo (`aria-describedby`).
- [ ] Áreas táctiles ≥ 44 × 44 px.
- [ ] `lang="es"`; textos ALT en imágenes y logos.
- [ ] `prefers-reduced-motion` respetado.
- [ ] Probado en 375, 768 y 1024 px.
- [ ] Escaneo `axe` sin violaciones (Playwright, fases 4, 5 y 7).

## Qué evitar

- Neumorfismo, glassmorphism, degradados y pasteles (lo que UI UX Pro Max sugería para "spa/belleza"; no encaja con una barbería y baja el contraste).
- Colores rojo/naranja/verde por paso en la reserva.
- Fuentes decorativas o manuscritas en texto o formularios.
- Sombras complejas y efectos 3D.
- Más de un botón principal por pantalla.

## Origen

Generado con UI UX Pro Max (`search.py --design-system`, variación 3, movimiento 2, densidad 5) y consultas de producto, color, tipografía y UX. Se tomó: estilo minimalista y suizo, patrón de embudo por pasos, semántica de reservas (disponible / no disponible / confirmar) y pautas de formularios. Se corrigió:
- **Paleta:** la sugerida (azul calendario + verde) era genérica y la de "belleza/spa" (pasteles) no encaja con barbería. Se sustituyó por carbón + cobre, con contraste medido.
- **Tipografía:** la sugerida usaba Playfair en cursiva como texto corrido, ilegible en formularios. Se invirtió: Inter para el texto, Playfair solo en títulos públicos.
- **Movimiento:** se descartó GSAP; bastan transiciones CSS.
- **Colores por paso** del patrón de embudo: descartados (el color no debe ser la única señal).
