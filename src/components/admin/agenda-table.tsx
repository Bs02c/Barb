"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage, SubmitButton } from "@/components/forms/fields";
import { useAdminForm } from "@/components/admin/use-admin-form";
import type { ActionState } from "@/lib/admin/action-state";
import { adminCancelAppointment } from "@/lib/admin/actions";
import { cn } from "@/lib/utils";

/** Cita lista para mostrar: la hora ya viene formateada en la zona de la barbería (src/lib/time.ts). */
export type AgendaRow = {
  id: string;
  /** Ej. "10:00–10:30". */
  timeRange: string;
  /** Hora de inicio, para el texto del diálogo. */
  startLabel: string;
  status: "active" | "cancelled";
  /** Calculado en el servidor: activa y aún no ha empezado. */
  cancellable: boolean;
  customerName: string;
  customerPhone: string;
  barberName: string;
  serviceName: string;
};

function StatusBadge({ status }: { status: AgendaRow["status"] }) {
  return status === "active" ? (
    <Badge variant="secondary" className="h-6 px-2.5 text-sm">
      Activa
    </Badge>
  ) : (
    <Badge variant="outline" className="h-6 px-2.5 text-sm">
      Cancelada
    </Badge>
  );
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone}`}
      className="inline-flex min-h-11 items-center rounded-md font-medium text-selection underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {phone}
    </a>
  );
}

function CancelAppointment({
  subdomain,
  row,
  onResult,
}: {
  subdomain: string;
  row: AgendaRow;
  onResult: (result: ActionState) => void;
}) {
  const [open, setOpen] = useState(false);
  const { pending, onSubmit } = useAdminForm({
    action: adminCancelAppointment,
    subdomain,
    onResult: (result) => {
      setOpen(false);
      onResult(result);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            aria-label={`Cancelar la cita de ${row.customerName} a las ${row.startLabel}`}
          />
        }
      >
        <Ban aria-hidden="true" />
        Cancelar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form method="post" onSubmit={onSubmit} className="contents">
          <input type="hidden" name="id" value={row.id} />
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cancelar la cita de {row.customerName} a las {row.startLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El horario quedará libre para otras reservas. Avisa al cliente por teléfono.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <SubmitButton variant="destructive" pending={pending} pendingLabel="Cancelando…">
              Cancelar cita
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Tabla en escritorio (md en adelante) y tarjetas en móvil. Las canceladas se muestran atenuadas. */
export function AgendaTable({ subdomain, rows }: { subdomain: string; rows: AgendaRow[] }) {
  const [notice, setNotice] = useState<ActionState | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <FormMessage state={notice} />

      {/* Móvil */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn("flex flex-col gap-2 rounded-lg border bg-card p-4", row.status === "cancelled" && "text-muted-foreground")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-semibold">{row.timeRange}</span>
              <StatusBadge status={row.status} />
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{row.customerName}</span>
              <PhoneLink phone={row.customerPhone} />
            </div>
            <p className="text-sm text-muted-foreground">
              {row.serviceName} · {row.barberName}
            </p>
            {row.cancellable && <CancelAppointment subdomain={subdomain} row={row} onResult={setNotice} />}
          </li>
        ))}
      </ul>

      {/* Escritorio */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full text-left">
          <caption className="sr-only">Citas del día</caption>
          <thead className="border-b bg-muted text-sm">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Hora</th>
              <th scope="col" className="px-4 py-3 font-medium">Barbero</th>
              <th scope="col" className="px-4 py-3 font-medium">Cliente</th>
              <th scope="col" className="px-4 py-3 font-medium">Servicio</th>
              <th scope="col" className="px-4 py-3 font-medium">Estado</th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className={cn("h-14", row.status === "cancelled" && "text-muted-foreground")}>
                <td className="px-4 py-2 font-medium whitespace-nowrap">{row.timeRange}</td>
                <td className="px-4 py-2">{row.barberName}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-col">
                    <span>{row.customerName}</span>
                    <PhoneLink phone={row.customerPhone} />
                  </div>
                </td>
                <td className="px-4 py-2">{row.serviceName}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  {row.cancellable && <CancelAppointment subdomain={subdomain} row={row} onResult={setNotice} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
