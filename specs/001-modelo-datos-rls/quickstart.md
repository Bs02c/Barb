# Validación rápida: fase 1

## Requisitos
- Docker en marcha.
- `npm install` hecho.

## Pasos

1. `npm run db:start`: arranca Supabase local.
2. `npm run db:reset`: aplica las migraciones y carga `supabase/seed.sql`.
   - **Esperado**: termina sin errores en menos de 2 minutos (SC-004).
3. `npm run test:db`: tests pgTAP.
   - **Esperado**: todos pasan. Cubren aislamiento (historia 1), solapamientos (historia 2), zona horaria (historia 3), consentimiento y formatos (historia 4) y casos límite.
4. `npm run test:integration`: dos reservas simultáneas del mismo hueco.
   - **Esperado**: exactamente una se acepta (SC-002); el test borra lo que creó.
5. `npm run test:db` de nuevo.
   - **Esperado**: mismo resultado; los tests no dejaron datos (SC-005).
6. Studio local (`http://127.0.0.1:54323`).
   - **Esperado**: dos barberías de demostración con sus datos; ninguna otra.
7. `npm run db:types`.
   - **Esperado**: `src/lib/database.types.ts` actualizado y `npm run typecheck` sin errores.

## Referencias
- Tablas y reglas: [data-model.md](data-model.md)
- Permisos: [contracts/acceso-por-rol.md](contracts/acceso-por-rol.md)
- Entornos: ADR-014 del vault (producción nunca recibe seed ni tests).
