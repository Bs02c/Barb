---
# DESIGN.md — Reservas para barberías
# Estado: APROBADO por el usuario (2026-10-14), propuesta 2: tema oscuro con acento cobre, inspirado en
# una página de reservas de referencia que eligió el usuario. Sustituye a la versión clara aprobada el 2026-10-05.
# Revisión 1 del usuario: "Lo más pronto" en el paso 2, "Número de contacto" en el paso 4, columna Barbero en la agenda.
# Implementación: el token `accent` (cobre) de este archivo se llama `selection` en CSS/Tailwind
# (bg-selection, text-selection-foreground), porque en shadcn `accent` es el fondo sutil de hover.
# Fuente de verdad del diseño (ADR-012). Generado con UI UX Pro Max y ajustado a mano (ver "Origen").
version: 0.2.0
mode: dark # un solo tema, oscuro, para la web pública y el panel (sin selector claro/oscuro)
colors:
  background: "#141210" # carbón cálido casi negro
  foreground: "#F5F1EC" # blanco hueso
  card: "#1D1A17" # tarjetas y paneles
  card-foreground: "#F5F1EC"
  primary: "#D9822B" # cobre: botón principal
  on-primary: "#1A1410" # texto oscuro sobre cobre (el blanco no llega a 4,5:1)
  accent: "#D9822B" # cobre: selección (borde de tarjeta, chip elegido, barra de pasos)
  on-accent: "#1A1410"
  link: "#E9A15A" # cobre claro: enlaces, etiquetas y texto en cobre sobre fondo oscuro
  muted: "#24201D" # fondos sutiles (hover, filas alternas)
  muted-foreground: "#A8A099"
  border: "#34302B" # separadores y tarjetas (decorativo)
  input: "#7A7068" # borde de campos y controles (≥ 3:1)
  ring: "#E9A15A"
  destructive: "#B91C1C" # botón de borrar/cancelar (texto blanco)
  on-destructive: "#FFFFFF"
  destructive-text: "#F87171" # mensajes de error sobre fondo oscuro
  success: "#4ADE80" # disponible / confirmada / "Abierto hoy"
  on-success: "#052E14"
  unavailable: "#221F1C" # horario no disponible (fondo)
  unavailable-foreground: "#958D86"
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
  md: 10px # por defecto: botones y campos
  lg: 14px # tarjetas, diálogos y hojas inferiores
  full: 9999px # chips de horario
spacing: tailwind-default # escala de 4 px
shadow:
  none: sobre fondo oscuro las sombras no se ven; la separación la dan `card` y `border`
motion:
  duration: { fast: 150ms, base: 200ms }
  easing: "cubic-bezier(0.2, 0, 0, 1)"
  reduced-motion: respetar `prefers-reduced-motion` (sin animación)
breakpoints: { sm: 640px, md: 768px, lg: 1024px }
touch-target: 44px
---

# Sistema de diseño: Reservas para barberías

## Intención

Una plataforma que usan muchas barberías distintas. El diseño debe ser **oscuro, cálido y muy legible**: el ambiente de una barbería moderna (luces bajas, cuero, metal) sin perder claridad. Prioridad: que reservar desde el celular sea rápido y sin errores.

- **Estilo:** tema oscuro con tarjetas (referencia elegida por el usuario el 2026-10-14: páginas de reserva tipo WeiBook). Jerarquía clara, mucho aire entre bloques, una sola columna en móvil.
- **Personalidad:** cobre sobre carbón cálido (no negro puro ni gris neutro), con un serif clásico solo en títulos públicos.
- **Dos caras, un tema:** la página pública (portada con los servicios, usa el serif) y el panel del admin (más denso, solo sans) comparten la misma paleta oscura.

## Color

| Uso | Token | Contraste medido |
|---|---|---|
| Texto sobre fondo / sobre tarjeta | `foreground` / `background`, `card` | 16,6:1 / 15,4:1 |
| Botón principal | `on-primary` / `primary` | 6,2:1 |
| Chip o tarjeta seleccionada (relleno cobre) | `on-accent` / `accent` | 6,2:1 |
| Borde de tarjeta seleccionada | `accent` / `card` | 5,9:1 |
| Enlace y texto cobre | `link` / `background`, `card` | 8,6:1 / 8,0:1 |
| Texto secundario | `muted-foreground` / `background`, `card` | 7,3:1 / 6,7:1 |
| Borde de campos | `input` / `background`, `card` | 3,9:1 / 3,6:1 (mínimo 3:1) |
| Botón de borrar o cancelar | `on-destructive` / `destructive` | 6,5:1 |
| Mensaje de error | `destructive-text` / `background`, `card` | 6,8:1 / 6,3:1 |
| Disponible / confirmada / abierto | `success` / `background`; `on-success` / `success` | 10,7:1; 8,6:1 |
| Horario no disponible | `unavailable-foreground` / `unavailable` | 5,0:1 |
| Anillo de foco | `ring` / `card` | 8,0:1 |

Reglas:
- **Un solo color de acento (cobre)**: botón principal, selección, enlaces y foco. El cobre de relleno siempre lleva texto oscuro (`on-primary`); el blanco sobre cobre no cumple.
- Lo seleccionado se distingue de lo accionable por la **forma**, no solo por el color: borde cobre de 2 px y marca de verificación.
- El color **nunca es la única señal**: un horario no disponible además va tachado y sin borde; un error lleva icono y texto.
- Sin blanco ni negro puros: el fondo es carbón cálido y el texto, blanco hueso.
- Los colores personalizados por barbería están en el Roadmap; cuando lleguen, se validará su contraste contra estos mínimos.

## Tipografía

- **Inter** para todo: texto, formularios, botones, panel. Cargada con `next/font` (sin peticiones a Google desde el navegador del cliente).
- **Playfair Display** solo para el nombre de la barbería y el título principal de páginas públicas. Nunca en párrafos ni formularios.
- Texto mínimo de 16 px en campos de formulario en móvil.
- Fechas y horas en formato local de Colombia (`es-CO`, por ejemplo "lun 13 oct, 10:30 a. m."), siempre en la zona horaria de la barbería.

## Componentes (shadcn/ui)

- **Botón principal:** fondo `primary` (cobre), texto `on-primary` (oscuro), alto mínimo 44 px, radio `md`. Uno por pantalla; en la portada, cada tarjeta de servicio lleva además su botón "Reservar" pequeño (40 px de alto, misma apariencia).
- **Botón secundario:** borde `input`, fondo transparente.
- **Campos:** etiqueta visible siempre encima (nunca solo placeholder), borde `input`, foco con anillo cobre de 2 px. `inputmode="tel"` para WhatsApp y `type="email"` para correo. Error debajo del campo, en `destructive`, con icono.
- **Tarjeta de servicio / barbero:** fondo `card`, borde `border`, radio `lg`, relleno 16 px; seleccionada: borde de 2 px `accent` y marca de verificación.
  - **En la portada:** nombre y precio en la primera línea (precio en negrita, cifras tabulares), descripción breve en `muted-foreground` (máximo dos líneas) y abajo la duración con icono de reloj y el botón "Reservar".
- **Portada de la barbería:** bloque superior con textura tenue de franjas de barbería (sin foto en el MVP; las fotos están en el Roadmap), etiqueta "Barbería" en `link`, nombre en Playfair, descripción corta, "Abierto hoy · 9:00 a. m. – 7:00 p. m." (estado en `success`, o "Cerrado hoy" en `muted-foreground`) y dirección con enlace "Ver mapa".
- **Chip de horario:** radio `full`, alto 44 px.
  - Disponible: borde `input`, fondo `card`.
  - Seleccionado: fondo `accent`, texto `on-accent`.
  - No disponible: fondo `unavailable`, texto `unavailable-foreground` tachado, no clicable.
- **Indicador de pasos** (reserva): "Paso 2 de 4" en texto + barra de progreso en `accent`. Sin colores distintos por paso.
- **Estados de envío:** botón con "Reservando…" y deshabilitado mientras se envía; después, pantalla de confirmación clara o error en línea.
- **Iconos:** Lucide (ya instalado), 20 px, trazo 1,75. Nunca emojis como iconos.

## Patrones

- **Portada = servicios:** la página principal de cada barbería muestra la portada, el botón principal "Reservar lo más pronto", la lista de servicios (cada uno con su "Reservar", que entra a la reserva con el servicio ya elegido, en el paso 2) y el horario de la semana con el día de hoy resaltado.
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

- Neumorfismo, glassmorphism, degradados llamativos y pasteles (lo que UI UX Pro Max sugería para "spa/belleza"; no encaja con una barbería y baja el contraste). El único degradado permitido es el que funde la textura de la portada con el fondo.
- Azul genérico de "app de reservas" como acento: el cobre es la identidad de la plataforma.
- Reseñas, estrellas, contadores de "clientes este mes" y fotos inventadas: fuera del MVP, y sin datos reales se ven falsos.
- Colores rojo/naranja/verde por paso en la reserva.
- Fuentes decorativas o manuscritas en texto o formularios.
- Sombras complejas y efectos 3D.
- Más de un botón principal por pantalla.

## Origen

**Propuesta 2 (2026-10-14):** el usuario compartió una página de reservas de barbería como referencia de estilo (tema oscuro, tarjetas de servicio con "Reservar", portada con datos del local) y eligió el acento cobre frente al azul de la referencia, comparando ambos en una maqueta. Se toma la estructura y el ambiente, no las fotos, reseñas ni contadores. Todo oscuro, también el panel, por coherencia y para mantener un solo juego de colores.

**Versión 1 (2026-10-05):**

Generado con UI UX Pro Max (`search.py --design-system`, variación 3, movimiento 2, densidad 5) y consultas de producto, color, tipografía y UX. Se tomó: estilo minimalista y suizo, patrón de embudo por pasos, semántica de reservas (disponible / no disponible / confirmar) y pautas de formularios. Se corrigió:
- **Paleta:** la sugerida (azul calendario + verde) era genérica y la de "belleza/spa" (pasteles) no encaja con barbería. Se sustituyó por carbón + cobre, con contraste medido.
- **Tipografía:** la sugerida usaba Playfair en cursiva como texto corrido, ilegible en formularios. Se invirtió: Inter para el texto, Playfair solo en títulos públicos.
- **Movimiento:** se descartó GSAP; bastan transiciones CSS.
- **Colores por paso** del patrón de embudo: descartados (el color no debe ser la única señal).
