# Quickstart: validar la spec 006

## Preparación

```bash
npm run db:start
npm run db:reset        # aplica 0001 y 0002 y carga el seed con descripción y dirección de "La Barbería"
npm run dev
```

## Validación automática

```bash
npm run lint && npm run typecheck && npm test   # incluye hours.test.ts y los esquemas
npm run test:db                                  # 00_structure (matriz), 01_isolation (UPDATE de barbershops), 04_constraints
npm run test:integration                         # isolation-app-login con updateBarbershopInfo, catálogo con weeklyHours
PLAYWRIGHT_CHANNEL=msedge npm run test:e2e       # portada, reserva desde la portada, "Mi barbería", axe
npm run build && npm run start                   # en otra terminal: npm run perf:ttfb (incluye "/")
```

Esperado: todo en verde y `axe` sin violaciones. El TTFB de `/` no supera en más de un 10 % al de `/reservar` (SC-005).

## Validación manual (con el usuario)

1. Abrir `http://labarberia.localhost:3000/`:
   - portada con textura, nombre, descripción, estado de apertura y dirección con "Ver mapa";
   - tres servicios con descripción;
   - horario de 7 días con hoy resaltado.
2. "Ver mapa" abre Google Maps con "Calle 45 # 12-30, Bogotá".
3. "Reservar" en "Corte clásico" lleva a elegir barbero con ese servicio.
4. `http://elcorte.localhost:3000/`: sin descripción ni dirección y sin huecos.
5. Entrar al panel (`admin@labarberia.example.com` / `Demo-Barberia-2026`) → "Mi barbería":
   - cambiar la dirección y guardar → recargar la portada → se ve la nueva;
   - vaciar la descripción y guardar → la línea desaparece de la portada.
6. "Servicios" → editar un servicio y añadirle descripción → se ve en la portada.
7. Recorrer la reserva, la cancelación y el panel: todo en oscuro con cobre, sin zonas claras.

## Comprobaciones de seguridad (las cubren los tests; referencia)

Ver la tabla "Resultado por actor" en `data-model.md`.
