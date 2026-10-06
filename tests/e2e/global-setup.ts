import { rm } from "node:fs/promises";
import path from "node:path";

// Los correos de desarrollo (EMAIL_TRANSPORT=outbox) traen enlaces de cancelación en claro y el
// proyecto vive en OneDrive: se vacía la carpeta antes de cada ejecución (revisión fase 5, MAINT-008).
export default async function globalSetup() {
  await rm(path.join(process.cwd(), ".outbox"), { recursive: true, force: true });
}
