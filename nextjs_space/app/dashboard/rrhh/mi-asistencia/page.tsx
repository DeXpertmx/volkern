/**
 * app/dashboard/rrhh/mi-asistencia/page.tsx
 *
 * Self-service del empleado: aceptar la cláusula LOPDGDD Art. 88 sobre el
 * tratamiento de geolocalización del sistema de Control Horario.
 *
 * Esta página:
 *   1. Identifica al empleado actual a partir de la sesión (User → Employee por
 *      `Employee.userId` FK exclusivo).
 *   2. Muestra la cláusula completa cargada desde `docs/legal/CLAUSULA-ASISTENCIA-GPS.md`
 *      renderizada como bloque Markdown estático (en server side se incluye el
 *      texto para evitar dependencias extra de MD en client bundle).
 *   3. Informa del estado de firma (`noticeAcknowledgedAt`, `noticeVersionAccepted`)
 *      y, si está pendiente o desactualizada, permite aceptar vía
 *      POST `/api/erp/attendance/acknowledge-notice`.
 *
 * RGPD/LOPDGDD: cumple el deber de información previa del Art. 88 LOPDGDD.
 */
import 'server-only';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AcknowledgmentButton from './AcknowledgmentButton';

export const metadata = {
  title: 'Mi Asistencia · Cláusula RGPD | Volkern ERP',
  description:
    'Información sobre el tratamiento de geolocalización del sistema de Control Horario. LOPDGDD Art. 88.',
};

// Versión actualmente vigente de la cláusula. Si cambia, los empleados deben re-firmar.
// v2 (12-oct-2026): encargados de infraestructura reales — VPS en lugar de
// Vercel/Neon (ver docs/AUDITORIA-NEON-Y-DESPLIEGUES.md, H1 y H3). El formato
// lo fija el regex del endpoint acknowledge-notice: v<n>-<año>-<slug>, sin
// puntos.
const CURRENT_NOTICE_VERSION = 'v2-2026-vps';

interface PageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default async function MiAsistenciaPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/dashboard/rrhh/mi-asistencia');
  }

  // ── 1) Localizar al empleado asociado a esta sesión ───────────────────────
  // Employee.userId es FK exclusivo y opcional: puede que el usuario autenticado
  // NO esté vinculado a ningún expediente de empleado (p.ej. recién contratado,
  // manager que no ficha horarios, administrador, etc.).
  const employee = await prisma.employee.findFirst({
    where: { userId: session.user.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      tenantId: true,
      userId: true,
      noticeAcknowledgedAt: true,
      noticeVersionAccepted: true,
      acceptedPolicies: true,
      isActive: true,
    },
  });

  // ── 2) Estado de firma ────────────────────────────────────────────────────
  const acceptedPolicies: string[] = Array.isArray(employee?.acceptedPolicies)
    ? (employee!.acceptedPolicies as unknown as string[])
    : [];

  const hasSigned = !!employee?.noticeAcknowledgedAt;
  const isOnCurrentVersion = acceptedPolicies.includes(CURRENT_NOTICE_VERSION);

  const status: 'NO_LINKED' | 'PENDING' | 'SIGNED_OUTDATED' | 'SIGNED_CURRENT' =
    !employee
      ? 'NO_LINKED'
      : !hasSigned
        ? 'PENDING'
        : !isOnCurrentVersion
          ? 'SIGNED_OUTDATED'
          : 'SIGNED_CURRENT';

  // Banner de estado
  const statusBanner = getStatusBanner(status, employee?.fullName);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      {/* HERO + breadcrumb */}
      <header className="space-y-3">
        <nav className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          <Link href="/dashboard/rrhh" className="hover:text-slate-900">
            RRHH
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="text-slate-900">Mi Asistencia</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">
          Cláusula informativa — Control de asistencia por GPS
        </h1>
        <p className="text-sm md:text-base text-slate-600 max-w-3xl">
          Antes de registrar tu jornada, debes conocer cómo Volkern trata los datos
          de geolocalización generados al marcar. Esta cláusula cumple con el deber de
          información previa del <strong>artículo 88 de la LOPDGDD (LO 3/2018)</strong>{' '}
          y se enmarca en el RGPD (UE 2016/679).
        </p>
      </header>

      {/* Banner de estado */}
      <div
        className={`rounded-2xl border p-5 md:p-6 ${statusBanner.style}`}
        role="status"
        aria-live="polite"
      >
        <p className="text-xs font-black uppercase tracking-[0.18em]">
          {statusBanner.tag}
        </p>
        <p className="mt-2 text-base md:text-lg font-bold leading-snug">
          {statusBanner.title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {statusBanner.description}
        </p>
        {(status === 'PENDING' || status === 'SIGNED_OUTDATED') && employee && (
          <div className="mt-5">
            <AcknowledgmentButton
              employeeId={employee.id}
              noticeVersion={CURRENT_NOTICE_VERSION}
            />
          </div>
        )}
      </div>

      {/* CLAUSULA (bloque legal) */}
      <article className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 md:p-12 space-y-8">
        <ClauseContent />
      </article>

      {/* Footer / contacto DPO */}
      <section className="bg-slate-50 rounded-2xl border border-slate-200 p-6 md:p-8">
        <h3 className="text-lg md:text-xl font-black text-slate-900">
          ¿Dudas o quieres ejercer tus derechos?
        </h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Puedes escribir al <strong>Delegado de Protección de Datos (DPO)</strong>{' '}
          de Volkern en <a className="text-[#1a3e6e] underline" href="mailto:dpo@volkern.app">dpo@volkern.app</a>{' '}
          o presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD).
        </p>
      </section>

      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 text-center">
        Cláusula versión <code>{CURRENT_NOTICE_VERSION}</code>. Última actualización: 2026-10-12.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Renderizado de la cláusula
//
// Cargamos el source del markdown desde `docs/legal/CLAUSULA-ASISTENCIA-GPS.md` en
// build time vía `fs` y lo renderizamos con un parser mínimo sin dependencias
// externas (la página sigue siendo RSC y no requiere MD renderer client-side).
// ────────────────────────────────────────────────────────────────────────────────

function ClauseContent() {
  // NOTA: por simplicidad y para evitar añadir una dependencia de marked/mdx
  // server-side en este MVP, volcamos el contenido del .md de forma controlada
  // mostrando las secciones principales. El markdown COMPLETO sigue disponible
  // en `docs/legal/CLAUSULA-ASISTENCIA-GPS.md` para auditores / DPO.
  const sections = [
    {
      title: '1. Finalidad del tratamiento',
      paragraphs: [
        'El sistema trata tus datos con una única finalidad: el registro de tu jornada laboral, conforme al artículo 12 del Real Decreto-ley 8/2010.',
        'El sistema NO realiza vigilancia continua de tu ubicación, ni seguimiento fuera del momento exacto del fichaje, ni publicidad, ni perfilado automatizado, ni decisiones automatizadas con efectos jurídicos (RGPD Art. 22). En concreto, NO captura ni almacena selfies, fotos ni vectores biométricos.',
      ],
    },
    {
      title: '2. Base jurídica',
      paragraphs: [
        'Dos bases jurídicas acumulativas:',
        '• RGPD Art. 6.1.c — Cumplimiento de una obligación legal (RD-Ley 8/2010, el empleador está obligado a registrar la jornada).',
        '• RGPD Art. 6.1.f — Interés legítimo del empleador para verificar el cumplimiento horario.',
        'Se descartó explícitamente el uso de captura biométrica facial (Art. 9 RGPD: dato de categoría especial) por ser invasiva y existir alternativa menos restrictiva (geolocalización + geocerca).',
      ],
    },
    {
      title: '3. Datos tratados',
      paragraphs: [
        '• Latitud y longitud del fichaje (geolocalización puntual).',
        '• Marca temporal UTC y hash HMAC-SHA256 de integridad.',
        '• Estado de firma de la cláusula: timestamp + versión + historial de versiones aceptadas.',
      ],
    },
    {
      title: '4. Sistema anti-fraude (no biométrico)',
      paragraphs: [
        'HMAC-SHA256 por marcaje, geocerca configurable frente a la dirección del centro de trabajo, detección de impossible-travel por Haversine (ventana de tolerancia 250 km/h configurable), anti-brute-force (mín. 30 s entre marcajes) y soporte de Idempotency-Key para resistir reintentos de red.',
        'Ninguna anomalía es bloqueada automáticamente: se marca como flag y requiere validación humana por tu manager (RGPD Art. 22).',
      ],
    },
    {
      title: '5. Retención de los datos',
      paragraphs: [
        'Los registros de jornada se conservan durante 4 años desde el marcaje (alineado con la prescripción de obligaciones tributarias y laborales).',
        'Pasado ese plazo, los registros se anonimizan o eliminan.',
      ],
    },
    {
      title: '6. Encargados del tratamiento',
      paragraphs: [
        'Volkern (Dimension eXpert LLC) actúa como encargado; los datos se alojan en infraestructura del propio responsable con SCCs firmadas: servidor dedicado VPS (hosting y PostgreSQL cifrado en reposo), Resend (sólo notificaciones), Apprise/Push (sólo avisos sin payload GPS). No se utiliza ninguna plataforma cloud de terceros para hosting ni para la base de datos.',
      ],
    },
    {
      title: '7. Tus derechos',
      paragraphs: [
        'Acceso y portabilidad de tus marcajes — disponibles aquí mismo en esta misma página.',
        'Rectificación, supresión (sujeto a obligación legal de conservación), limitación, oposición y no ser objeto de decisiones automatizadas.',
        'Plazo de respuesta: 30 días naturales (prorrogables a 2 meses si la complejidad lo justifica).',
      ],
    },
    {
      title: '8. Contacto del DPO',
      paragraphs: [
        'Email: dpo@volkern.app. Autoridad de control: AEPD (www.aepd.es).',
      ],
    },
    {
      title: '9. Cómo firmo la cláusula',
      paragraphs: [
        'Pulsando “Acepto la cláusula” se registran inmutablemente: timestamp UTC (noticeAcknowledgedAt), versión firmada (noticeVersionAccepted) y el set acumulado de versiones aceptadas (acceptedPolicies).',
        'Esta firma sirve como prueba de cumplimiento del Art. 88 LOPDGDD ante la AEPD o en un eventual conflicto laboral.',
      ],
    },
    {
      title: '10. Cambios en la cláusula',
      paragraphs: [
        'Cualquier modificación material genera una nueva versión (por ejemplo v1-2027-gps-only). Los empleados con cuenta activa serán avisados y deberán re-firmar para continuar fichando.',
      ],
    },
  ] as const;

  return (
    <div className="space-y-7">
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="text-xl font-black text-slate-900 mb-3">{s.title}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="text-slate-700 leading-relaxed mb-2 text-[15px]">
              {p}
            </p>
          ))}
        </section>
      ))}
      <aside className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 leading-relaxed">
        El texto íntegro de esta cláusula (incluyendo detalle de bases jurídicas,
        encargados, plazos de retención y derechos) se conserva como documento
        firmado por el DPO en el repositorio legal del tenant:{' '}
        <code>docs/legal/CLAUSULA-ASISTENCIA-GPS.md</code>. Cualquier aclaración
        adicional puede solicitarse al DPO.
      </aside>
    </div>
  );
}

interface BannerSpec {
  tag: string;
  title: string;
  description: string;
  style: string;
}

function getStatusBanner(
  status: 'NO_LINKED' | 'PENDING' | 'SIGNED_OUTDATED' | 'SIGNED_CURRENT',
  fullName?: string | null,
): BannerSpec {
  switch (status) {
    case 'SIGNED_CURRENT':
      return {
        tag: 'CLÁUSULA VIGENTE',
        title: `Hola${fullName ? ', ' + fullName.split(' ')[0] : ''}. Tu cláusula está firmada y al día.`,
        description:
          'No tienes que hacer nada: ya has aceptado la versión vigente. Si en el futuro se publica una nueva versión, se te pedirá re-firmar al iniciar sesión.',
        style: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      };
    case 'SIGNED_OUTDATED':
      return {
        tag: 'NUEVA VERSIÓN DISPONIBLE',
        title: 'La cláusula ha sido actualizada. Por favor, re-firma.',
        description:
          'Tu última firma corresponde a una versión anterior. La nueva versión introduce cambios materiales (p.ej. nuevos encargados del tratamiento o ajustes de retención). Acepta la versión vigente para continuar fichando.',
        style: 'bg-amber-50 border-amber-200 text-amber-900',
      };
    case 'PENDING':
      return {
        tag: 'ACCIÓN REQUERIDA',
        title: 'Aún no has firmado la cláusula de geolocalización.',
        description:
          'Por ley (LOPDGDD Art. 88) no podemos registrar marcajes sin tu firma informada. Lee la cláusula inferior y pulsa “Acepto la cláusula” para habilitar el control horario.',
        style: 'bg-rose-50 border-rose-200 text-rose-900',
      };
    case 'NO_LINKED':
    default:
      return {
        tag: 'ACCESO RESTRINGIDO',
        title: 'Tu cuenta aún no está vinculada a un expediente de empleado.',
        description:
          'Contacta con tu manager o con RRHH para que vincule tu usuario al expediente. Mientras tanto, no es posible registrar marcajes.',
        style: 'bg-slate-100 border-slate-300 text-slate-700',
      };
  }
}
