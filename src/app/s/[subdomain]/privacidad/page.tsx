import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicBarbershop } from "@/lib/barbershops";

// Política de tratamiento de datos personales (spec 002, FR-015; research §7; Ley 1581 de 2012).
// PLANTILLA PENDIENTE DE REVISIÓN LEGAL: este texto no sustituye asesoría jurídica y debe revisarlo
// un abogado antes del primer cliente real (anotado en Pendientes.md del vault).
// La barbería es la responsable del tratamiento; la plataforma, la encargada.

// Canal para ejercer los derechos (solicitudes por correo, proceso manual en el MVP).
// PENDIENTE: sustituir por el correo real de la plataforma antes de publicar.
const PRIVACY_EMAIL = "privacidad@midominio.com";

export async function generateMetadata(props: PageProps<"/s/[subdomain]/privacidad">): Promise<Metadata> {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) return {};
  return {
    title: `Política de tratamiento de datos · ${barbershop.name}`,
    description: `Cómo trata ${barbershop.name} los datos personales de quienes reservan una cita.`,
  };
}

export default async function PrivacyPage(props: PageProps<"/s/[subdomain]/privacidad">) {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) notFound();

  const linkClass =
    "rounded-sm font-medium text-selection underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 leading-relaxed">
      <header className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold">{barbershop.name}</p>
        <h1 className="font-display text-3xl font-bold">Política de tratamiento de datos personales</h1>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Responsable y encargado</h2>
        <p>
          <strong>{barbershop.name}</strong> es la responsable del tratamiento de los datos personales que dejas al
          reservar una cita. La plataforma de reservas que usa la barbería actúa como encargada: guarda y procesa
          esos datos solo por cuenta de la barbería y según esta política, en cumplimiento de la Ley 1581 de 2012
          y sus normas reglamentarias.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Qué datos recogemos</h2>
        <p>Solo tu nombre, tu número de contacto y tu correo electrónico, además de la cita que reservas.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Para qué los usamos</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Registrar y gestionar tu cita.</li>
          <li>Enviarte avisos sobre ella, como la confirmación o un cambio.</li>
        </ul>
        <p>No vendemos ni cedemos tus datos a terceros ni los usamos con fines publicitarios.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Tu autorización</h2>
        <p>
          Al marcar la casilla de autorización en el formulario de reserva aceptas este tratamiento. Guardamos la
          fecha y hora en que diste esa autorización.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Tus derechos</h2>
        <p>Como titular de los datos puedes, en cualquier momento:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Conocer los datos que tenemos sobre ti.</li>
          <li>Actualizarlos y rectificarlos.</li>
          <li>Solicitar que se supriman.</li>
          <li>Revocar la autorización que diste.</li>
          <li>Pedir prueba de la autorización y presentar quejas ante la Superintendencia de Industria y Comercio.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Cómo ejercerlos</h2>
        <p>
          Escribe a{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`} className={linkClass}>
            {PRIVACY_EMAIL}
          </a>{" "}
          indicando el nombre de la barbería, tu nombre y el número de contacto con el que reservaste. Atenderemos
          las consultas en un máximo de 10 días hábiles y los reclamos en un máximo de 15 días hábiles, como indica
          la ley.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Vigencia</h2>
        <p>
          Conservamos tus datos mientras sean necesarios para gestionar tus citas o hasta que pidas suprimirlos,
          salvo que una obligación legal exija guardarlos más tiempo. Esta política rige desde su publicación.
        </p>
      </section>

      <Link href="/" className={`w-fit ${linkClass}`}>
        Volver a {barbershop.name}
      </Link>
    </main>
  );
}
