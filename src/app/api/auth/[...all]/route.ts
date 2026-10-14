import { toNextJsHandler } from "better-auth/next-js";
import { AUTH_ALLOWED_PATHS, getAuth } from "@/lib/auth/auth";

// Better Auth en /api/auth/*. El proxy deja pasar esta ruta solo desde el subdominio de una barbería.
// Lista blanca: solo el login. El resto (registro, recuperar contraseña, cambiar correo, borrar
// usuario, OAuth, leer o cerrar la sesión…) responde 404 aunque Better Auth lo traiga
// (spec 005, FR-016). disabledPaths no sirve para rutas con parámetros como /reset-password/:token.

function isAllowed(request: Request): boolean {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  return (AUTH_ALLOWED_PATHS as readonly string[]).includes(path);
}

const notFound = () => new Response("Not Found", { status: 404 });

export async function GET(request: Request) {
  return isAllowed(request) ? toNextJsHandler(getAuth()).GET(request) : notFound();
}

export async function POST(request: Request) {
  return isAllowed(request) ? toNextJsHandler(getAuth()).POST(request) : notFound();
}
