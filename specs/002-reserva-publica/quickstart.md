# Validación rápida: fase 4

## Requisitos
- Docker y Supabase local en marcha (`npm run db:start`), `npm run db:reset` hecho.
- Chromium de Playwright instalado (`npx playwright install chromium`).

## Pasos
1. `npm test`: unitarios de disponibilidad, teléfono y esquema.
   - **Esperado**: todos pasan.
2. `npm run test:integration`: reglas del servidor y reservas simultáneas.
   - **Esperado**: todos pasan; la base queda como antes.
3. `npm run test:e2e`: reserva en móvil y escaneo `axe`.
   - **Esperado**: pasa, sin violaciones de accesibilidad; la cita de prueba se borra.
4. Manual: `npm run dev` y abrir `http://labarberia.localhost:3000`, "Reservar cita".
   - **Esperado**: los 4 pasos, horas cada 15 min sin solapes con las citas del 13 oct, "Lo más pronto" asigna barbero y confirmación con resumen.
5. Manual: intentar la misma hora en dos pestañas.
   - **Esperado**: la segunda ve "Ese horario ya no está disponible".

## Referencias
- [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/booking.md](contracts/booking.md)
