import "./load-env";

// Preparación y limpieza de datos de los E2E: mismo helper que los tests de integración
// (db_owner contra la base local; se niega a correr contra hosts no locales, ADR-014).
export { deleteBarbershop, insert, ownerDb, query } from "../../integration/helpers/db";
