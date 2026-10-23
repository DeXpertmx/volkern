/**
 * Páginas del dossier de CLIENTE del CRM de Ventas: el mismo producto que el
 * dossier comercial, pero para dejarlo en manos del cliente.
 *
 * POR QUÉ ES UN MÓDULO APARTE
 * No es el dossier de ventas con los números tapados. Si el documento va a
 * circular fuera, sobran las ocho objeciones, el guion de quince minutos y las
 * instrucciones al comercial («qué enseñar», «cómo cerrar el precio»): ahí se
 * ve el truco y se pierde la conversación. Aquí queda el problema, el producto
 * con sus seis pantallas, la puesta en marcha y cómo empezar.
 *
 * QUÉ NO SE ESCRIBE AQUÍ
 * · Ningún precio, ni por usuario, ni por nivel, ni suma de herramientas. La
 *   inversión se concreta en la propuesta, que es lo que se ha pedido.
 * · La prueba sale de `lib/crm-pricing.ts` (`TRIAL`), igual que en el dossier
 *   interno, para que no se anuncie una duración distinta de la que se aplica.
 *
 * Los nombres de clase (page, card, quote, stat…) son los del CSS del generador;
 * este módulo solo compone marcado y recibe los ayudantes ya resueltos.
 */
const { TRIAL } = require('./escalera.cjs')

const CONTACTO = 'info@volkern.app'

/**
 * @param {{
 *   pie: (num: number, seccion?: string) => string,
 *   shot: (clave: string, alt: string, nota?: string) => string,
 *   lista: (items: string[], clase?: string) => string,
 *   card: (numero: string, titulo: string, texto: string) => string,
 *   imagenes: Record<string, string>,
 * }} h
 * @returns {string[]} una página HTML por elemento, en orden.
 */
function paginasCliente({ pie, shot, lista, card, imagenes }) {
  return [
    /* 1 · Portada ─────────────────────────────────────────────────────── */
    `<section class="page cover">
    <div class="cover-inner">
      <div class="marca">
        <div class="mark">V</div>
        <div><b>VOLKERN</b><span>CRM DE VENTAS</span></div>
      </div>
      <div class="kicker">Dossier · CRM de Ventas</div>
      <h1>Que ninguna oportunidad se enfríe <em>por olvido.</em></h1>
      <p class="sub">Qué problema resuelve, cómo se ve en pantalla y cómo se pone en marcha un equipo comercial sin depender de la memoria de nadie.</p>
      <div class="chips">
        <span class="chip">Embudo visual</span>
        <span class="chip">Seguimiento que no se olvida</span>
        <span class="chip">Previsión fiable</span>
        <span class="chip">Prueba de ${TRIAL} días</span>
      </div>
      <div class="shot"><img src="${imagenes.embudo}" alt="Panel de embudo de ventas de Volkern CRM"></div>
      <div class="cover-index">
        <div><b>01</b> El problema</div>
        <div><b>02</b> La propuesta</div>
        <div><b>03</b> La demo</div>
        <div><b>04</b> Puesta en marcha</div>
        <div><b>05</b> Cómo empezar</div>
      </div>
      <div class="pie">
        <div><b>Documento para el cliente</b>Octubre de 2026 · CRM de Ventas</div>
        <div style="text-align:right"><b>volkern.app</b>${CONTACTO}</div>
      </div>
    </div>
  </section>`,

    /* 2 · El problema ─────────────────────────────────────────────────── */
    `<section class="page">
    <div class="kicker">01 · El problema</div>
    <h2>Cuando el equipo vende de memoria, <span class="azul">el dinero se va por las grietas</span></h2>
    <p class="lead">Estas cinco frases se oyen en casi cualquier equipo comercial. No hablan de falta de talento: hablan de un seguimiento que vive en la cabeza de alguien.</p>

    <div class="cols2" style="gap:5mm">
      <div class="card" style="background:#fff">
        <h3>«Se me pasó llamarle.»</h3>
        <p>Un lead caliente se enfría en dos días. Nadie sabe cuántos se han quedado por el camino porque no hay un sitio donde mirar.</p>
      </div>
      <div class="card" style="background:#fff">
        <h3>«No sé por qué perdimos esta.»</h3>
        <p>Sin motivo de pérdida, el error se repite cada mes. El equipo cree que es el precio; casi nunca es solo el precio.</p>
      </div>
      <div class="card" style="background:#fff">
        <h3>«¿Cómo vamos?» · «Pregúntale a Juan.»</h3>
        <p>La previsión vive en la cabeza de una persona. Si Juan se va de vacaciones, el director se queda a ciegas.</p>
      </div>
      <div class="card" style="background:#fff">
        <h3>«Ese cliente es mío.»</h3>
        <p>La cartera no es de la empresa: es del comercial que la apunta donde puede. Cuando se va, se lleva la memoria y el teléfono.</p>
      </div>
    </div>

    <div class="card" style="background:#fff;margin-top:4.5mm">
      <h3>«El presupuesto lo hago en Word.»</h3>
      <p>Tres versiones del mismo documento, ninguna aprobada, y nadie sabe si el cliente llegó a abrir el archivo. La propuesta se convierte en un acto de fe.</p>
    </div>

    <div class="big-card" style="margin-top:5.5mm">
      <h3>La cuenta que conviene hacer</h3>
      <div class="stat" style="margin-top:2mm"><span class="big">72.000 €</span><span class="unit">al año</span></div>
      <p style="margin-top:1.5mm">Ticket medio de 3.000 € y solo dos oportunidades perdidas al mes por falta de seguimiento. Una sola de esas dos ventas paga el CRM durante años.</p>
      <div class="nota">Ejemplo con cifras redondas para hacer la cuenta con tus propios números. No es una promesa de resultados.</div>
    </div>

    <div class="quote" style="margin-top:5mm">
      <b>La causa no es el equipo. Es el sistema.</b> Un comercial que se acuerda de todo es una excepción; un equipo que no depende de la memoria es un proceso.
    </div>

    <div class="card" style="background:#fff;margin-top:5mm">
      <h3>Lo que cambia cuando el seguimiento deja de ser personal</h3>
      <p>La oportunidad se mueve porque toca, no porque alguien se acuerde. El director ve el riesgo antes del cierre del trimestre. Y la cartera se queda en la empresa aunque cambie el equipo.</p>
    </div>
    ${pie(2, 'CRM de Ventas · Diagnóstico')}
  </section>`,

    /* 3 · La propuesta ────────────────────────────────────────────────── */
    `<section class="page">
    <div class="kicker">02 · La propuesta</div>
    <h2>Lo que hace, <span class="azul">en una frase</span></h2>
    <p class="lead" style="font-size:12pt;color:#0f172a;font-weight:600;max-width:180mm">Volkern CRM es el sitio donde tu equipo ve qué hacer cada día para no perder ninguna venta. Ni una libreta más bonita, ni un programa para informáticos.</p>

    <div class="cols2" style="margin-top:6mm;gap:5mm">
      ${card('1', 'Captas', 'La web, los formularios, las llamadas y las campañas dejan de vivir en sitios distintos. Cada contacto entra con su origen, para saber qué canal trae clientes de verdad.')}
      ${card('2', 'Ordenas', 'Cada oportunidad tiene su etapa, su valor y su fecha. El embudo deja de ser una idea y se convierte en una lista de trabajo.')}
    </div>
    <div class="cols2" style="margin-top:4mm;gap:5mm">
      ${card('3', 'Acompañas', 'La siguiente llamada, el correo pendiente y el aviso de que algo se enfría. El seguimiento no depende de la memoria de nadie.')}
      ${card('4', 'Cierras y aprendes', 'Previsión del mes, motivos de pérdida y resultados por comercial. Lo que funciona se repite; lo que no, se corrige a tiempo.')}
    </div>

    <h3 style="margin-top:7mm;font-size:11.4pt">Lo que cambia el lunes por la mañana</h3>
    <div class="cols3" style="margin-top:3mm">
      <div>
        ${lista([
          '<b>Nadie pregunta «¿cómo vamos?»</b> El embudo está abierto en la pantalla de todos.',
          '<b>El comercial sabe por dónde empezar</b> sin revisar el correo durante una hora.',
        ])}
      </div>
      <div>
        ${lista([
          '<b>El director ve el riesgo</b> antes de que la oportunidad esté perdida, no en el cierre del trimestre.',
          '<b>Las propuestas dejan rastro</b> y se convierten en contrato sin reescribirlas.',
        ])}
      </div>
      <div>
        ${lista([
          '<b>El equipo deja de teclear dos veces</b> lo mismo en el CRM, en el correo y en la hoja de cálculo.',
          '<b>La empresa se queda con la cartera</b> aunque un comercial se vaya.',
        ])}
      </div>
    </div>

    <div class="quote" style="margin-top:5mm">
      <b>Cada mañana, cada comercial sabe</b> a quién llamar, qué está en riesgo y cuánto se va a cerrar. Sin hojas de cálculo y sin perseguir a nadie por el pasillo.
    </div>
    <div class="quote" style="margin-top:3.5mm;border-left-color:#94a3b8;background:#f8fafc">
      <b>Lo que no cambia:</b> tu equipo sigue vendiendo y la relación sigue siendo humana. Lo que desaparece es el trabajo de recordar, copiar y perseguir información.
    </div>
    ${pie(3, 'CRM de Ventas · La propuesta')}
  </section>`,

    /* 4 · El embudo ──────────────────────────────────────────────────── */
    `<section class="page">
    <div class="kicker">03 · El embudo</div>
    <h2>Todo lo que está en juego, <span class="azul">en una sola pantalla</span></h2>
    <p class="lead">Se acabó preguntar cómo va el mes. Cada oportunidad está en su etapa, con su valor, su probabilidad y los días que lleva parada.</p>
    ${shot('embudo', 'Embudo de ventas')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Lo que se hace en esta pantalla</h3>
        ${lista([
          '<b>Arrastrar una tarjeta</b> de una etapa a otra. La previsión se recalcula sola: no hay que tocar una hoja de cálculo.',
          '<b>Comparar la previsión con el objetivo.</b> El panel dice cuánto falta, no solo cuánto hay.',
          '<b>Abrir una oportunidad.</b> Ahí se ve por qué está donde está y cuál es el siguiente paso.',
        ])}
      </div>
      <div>
        <h3>Lo que se entiende sin explicación</h3>
        ${lista([
          'Quién lleva cada cuenta y en qué punto está.',
          'Qué se va a cerrar este mes y qué está en riesgo.',
          'Dónde se atasca el embudo: si hay muchas propuestas y pocos cierres, el problema no es la captación.',
        ])}
      </div>
    </div>
    <div class="quote"><b>La diferencia con una lista:</b> aquí cada tarjeta lleva un importe y una fecha, así que el embudo se puede planificar. Una lista de deseos no se puede.</div>
    ${pie(4, 'CRM de Ventas · El embudo')}
  </section>`,

    /* 5 · La ficha del cliente ───────────────────────────────────────── */
    `<section class="page">
    <div class="kicker">04 · La ficha del cliente</div>
    <h2>Antes de llamar, <span class="azul">ya se sabe qué pasa</span></h2>
    <p class="lead">La ficha reúne la conversación, la propuesta, las veces que se abrió y la siguiente acción. Sin buscar en el correo ni interrumpir a un compañero.</p>
    ${shot('ficha-lead', 'Ficha del lead y siguiente paso')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Lo que ve el comercial en diez segundos</h3>
        ${lista([
          '<b>El siguiente paso está escrito</b>, con hora y motivo. No es una lista de deseos: es una acción concreta.',
          '<b>El historial está ordenado:</b> llamadas, correos, reuniones y notas en el mismo sitio.',
          '<b>La puntuación dice a quién llamar primero</b>, no a quién grita más fuerte.',
        ])}
      </div>
      <div>
        <h3>Lo que ve el director</h3>
        ${lista([
          'Qué oportunidades tienen actividad real y cuáles están abandonadas.',
          'Qué comercial necesita ayuda antes de que sea tarde.',
          'De dónde vienen los leads que acaban comprando.',
          'Si el equipo cumple lo que promete al cliente.',
        ])}
      </div>
    </div>
    <div class="quote"><b>En la práctica:</b> nadie tiene que reconstruir una conversación de hace tres semanas. Está escrita, con quién habló, qué se acordó y qué toca ahora.</div>
    ${pie(5, 'CRM de Ventas · Ficha del cliente')}
  </section>`,

    /* 6 · El día a día ────────────────────────────────────────────────── */
    `<section class="page">
    <div class="kicker">05 · El día a día</div>
    <h2>Cada comercial empieza el día <span class="azul">sabiendo qué hacer</span></h2>
    <p class="lead">Tres prioridades, los pendientes de hoy y los avisos que no pueden esperar. Diez minutos de rutina en lugar de una hora buscando información.</p>
    ${shot('mi-dia', 'Mi día: prioridades, tareas y avisos')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Por qué se usa todos los días</h3>
        ${lista([
          '<b>El orden lo pone el dinero en juego</b> y el riesgo de pérdida, no la urgencia del último correo.',
          '<b>Las tareas vencidas suben solas.</b> No hay que acordarse de mirar una lista aparte.',
          '<b>Los avisos llegan antes</b> de que la oportunidad esté muerta: días sin contacto, propuestas que caducan.',
        ])}
      </div>
      <div>
        <h3>La rutina de diez minutos</h3>
        ${lista([
          '<b>2 minutos:</b> mirar las tres prioridades del día.',
          '<b>5 minutos:</b> resolver los avisos y reprogramar lo que no toca hoy.',
          '<b>3 minutos:</b> cerrar el día marcando lo hecho y dejando escrita la siguiente tarea.',
        ], 'check')}
      </div>
    </div>
    <div class="quote"><b>La diferencia con una lista de tareas:</b> aquí cada tarea está unida a un cliente, a una oportunidad y a un importe. Se sabe por qué se hace y cuánto vale terminarla.</div>
    ${pie(6, 'CRM de Ventas · El día a día')}
  </section>`,

    /* 7 · Los resultados ─────────────────────────────────────────────── */
    `<section class="page">
    <div class="kicker">06 · Los resultados</div>
    <h2>El lunes, en cinco minutos, <span class="azul">se sabe qué corregir</span></h2>
    <p class="lead">Previsión, cierres, tasa de conversión y avance por comercial. Datos del mes en curso, no del trimestre pasado ni de una hoja que alguien actualizó el viernes.</p>
    ${shot('resultados', 'Resultados del equipo')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Las cuatro preguntas que responde</h3>
        ${lista([
          '¿Vamos a llegar al objetivo o nos falta dinero?',
          '¿Dónde se atasca el embudo: captación, propuesta o cierre?',
          '¿Quién necesita ayuda esta semana?',
          '¿Por qué perdemos? Precio, competencia, tiempo o falta de seguimiento.',
        ])}
      </div>
      <div>
        <h3>Para el director comercial</h3>
        <p style="font-size:8.8pt;color:#475569">No es un panel para mirar: es una herramienta para decidir dónde poner el foco. La reunión de los lunes deja de ser una ronda de opiniones y pasa a ser una conversación sobre tres números.</p>
        <div class="card" style="margin-top:3mm;background:#fff">
          <p><b>Lo que se puede decir en la reunión:</b> «Tenemos 168.900 € en previsión, faltan 41.200 € y el 60 % está en dos oportunidades. O las movemos esta semana o el objetivo no sale.»</p>
        </div>
      </div>
    </div>
    <div class="quote"><b>El valor no es el informe:</b> es saber el lunes qué cambiar para que el viernes no sorprenda el resultado.</div>
    ${pie(7, 'CRM de Ventas · Resultados')}
  </section>`,

    /* 8 · El trabajo repetitivo ──────────────────────────────────────── */
    `<section class="page">
    <div class="kicker">07 · El trabajo repetitivo</div>
    <h2>Lo que se hace solo <span class="azul">deja de olvidarse</span></h2>
    <p class="lead">Reparto de leads, recordatorios, avisos de oportunidades frías y tareas al cerrar. Reglas sencillas que se montan en dos minutos y se pausan cuando quieras.</p>
    ${shot('automatizaciones', 'Automatizaciones y reglas activas')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Cuatro reglas que suelen bastar</h3>
        ${lista([
          '<b>Lead nuevo:</b> se asigna al comercial de guardia y se avisa. Nadie tiene que repartir a mano.',
          '<b>Propuesta sin respuesta:</b> a los tres días, recordatorio al comercial y un correo suave al cliente.',
          '<b>Oportunidad parada:</b> si lleva una semana sin actividad, se marca en riesgo y avisa al responsable.',
        ])}
      </div>
      <div>
        <h3 style="visibility:hidden">.</h3>
        ${lista([
          '<b>Cierre ganado:</b> se crea la tarea de alta del cliente y avisa a administración. No se pierde el traspaso.',
          '<b>Renovación:</b> aviso treinta días antes de que venza el contrato.',
        ])}
        <div class="card" style="margin-top:2mm;background:#fff">
          <p><b>La regla de oro:</b> se automatiza el recordatorio, no la relación. El mensaje importante lo sigue escribiendo una persona.</p>
        </div>
      </div>
    </div>
    <div class="quote"><b>El objetivo no es que un robot venda:</b> es que nadie pierda una venta por algo que se podía avisar solo.</div>
    ${pie(8, 'CRM de Ventas · Automatizaciones')}
  </section>`,

    /* 9 · Del presupuesto al cobro ───────────────────────────────────── */
    `<section class="page">
    <div class="kicker">08 · La propuesta</div>
    <h2>Del presupuesto al cobro, <span class="azul">sin versiones sueltas</span></h2>
    <p class="lead">Una propuesta con su historial: cuándo se envió, cuántas veces se abrió, qué se habló después y cuál es el siguiente paso. La misma verdad para el comercial, el cliente y administración.</p>
    ${shot('cotizacion', 'Cotización con seguimiento')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Lo que se ve en la pantalla</h3>
        ${lista([
          '<b>Plantillas con tus conceptos</b>, descuentos e impuestos. Sin rehacer el documento cada vez.',
          '<b>Sabes si el cliente la ha leído</b> antes de llamarle. La llamada cambia por completo.',
          '<b>Se convierte en contrato</b> sin volver a teclearla.',
          '<b>Todo queda unido</b> a la oportunidad, al cliente y a su historial.',
        ])}
      </div>
      <div>
        <h3>Lo que resuelve de verdad</h3>
        <p style="font-size:8.8pt;color:#475569">El problema no es hacer el PDF. Es saber qué pasa después de enviarlo. ¿La ha visto el que decide? ¿Se quedó en la bandeja de un asistente? ¿La están comparando con otra? Sin ese dato, el seguimiento es a ciegas.</p>
        <div class="card" style="margin-top:3mm;background:#fff">
          <p><b>Una pregunta útil:</b> de las propuestas enviadas este mes, ¿cuántas sabes si se han leído?</p>
        </div>
      </div>
    </div>
    <div class="quote"><b>El seguimiento deja de ser una suposición:</b> cada propuesta enviada lleva su rastro, y el recordatorio juega a tu favor en vez de depender de que el cliente se acuerde de ti.</div>
    ${pie(9, 'CRM de Ventas · Propuestas')}
  </section>`,

    /* 10 · El coste real (sin cifras) ────────────────────────────────── */
    `<section class="page">
    <div class="kicker">09 · El coste real</div>
    <h2>No es un gasto más: <span class="azul">es una herramienta menos</span></h2>
    <p class="lead">La mayoría de equipos pequeños no compara un CRM con otro CRM. Compara un CRM, una herramienta de email, una de tareas, otra de automatización y una hoja de cálculo. Ahí está la conversación.</p>

    <table class="pay" style="margin-top:3mm">
      <tr><th style="width:38%">Lo que necesitas</th><th style="width:31%">Hoy, repartido</th><th style="width:31%">Con Volkern</th></tr>
      <tr><td>Contactos, empresas y leads</td><td>CRM + hoja de cálculo</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Embudo y seguimiento</td><td>CRM + memoria del comercial</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Email y mensajería</td><td>Herramienta de email + WhatsApp</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Llamadas y agenda</td><td>Telefonía + calendario</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Presupuestos y contratos</td><td>Word + firma aparte</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Tareas y seguimiento diario</td><td>Gestor de tareas</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Informes y previsión</td><td>Hoja de cálculo</td><td><b>Un solo sitio</b></td></tr>
    </table>

    <div class="big-card" style="margin-top:6mm">
      <div class="kicker" style="color:#1d4ed8">Siete piezas, siete sitios</div>
      <div class="stat"><span class="big" style="color:#1e3a8a">7 → 1</span><span class="unit" style="color:#3b5bdb">una sola herramienta</span></div>
      <p style="margin-top:1.5mm;color:#3b5bdb">Cada pieza por separado tiene su factura, su contrato y su forma de exportar datos. El coste que no aparece en ninguna factura es el rato que se va buscando el dato en la herramienta equivocada.</p>
    </div>

    <div class="cols3" style="margin-top:5mm">
      <div class="card" style="background:#fff"><h3>El tiempo</h3><p>Una hora al día buscando datos entre cinco herramientas son cinco semanas al año por comercial.</p></div>
      <div class="card" style="background:#fff"><h3>Los errores</h3><p>Dos versiones del mismo presupuesto, un cliente que recibe el precio equivocado y una venta que se enfría.</p></div>
      <div class="card" style="background:#fff"><h3>La memoria</h3><p>Si el conocimiento se va con la persona, la empresa no tiene un activo: tiene una dependencia.</p></div>
    </div>

    <div class="quote"><b>Un solo sitio no es una comodidad:</b> es la diferencia entre saber qué está pasando y enterarse cuando ya es tarde.</div>
    <p style="margin-top:3.5mm;font-size:7.4pt;color:#94a3b8;line-height:1.45">Las siete piezas son las que suele tener repartidas un equipo comercial pequeño; no es una comparativa de proveedores ni una tarifa. El alcance y las condiciones se concretan en la propuesta para tu equipo.</p>
    ${pie(10, 'CRM de Ventas · Coste real')}
  </section>`,

    /* 11 · La puesta en marcha ──────────────────────────────────────── */
    `<section class="page">
    <div class="kicker">10 · La puesta en marcha</div>
    <h2>Qué pasa desde el primer día</h2>
    <p class="lead">Dos sesiones y ${TRIAL} días de prueba. Sin implantación de meses ni consultoría obligatoria: el objetivo es que el lunes cada comercial sepa dónde mirar.</p>

    <div class="cols2" style="gap:4mm 5mm">
      <div class="card" style="background:#fff"><h3>1 · Alta de la cuenta</h3><p>Diez minutos. Nombre, usuarios, módulos y el nivel contratado. Sin tarjeta durante la prueba.</p></div>
      <div class="card" style="background:#fff"><h3>2 · Importar contactos y leads</h3><p>Se traen desde un archivo o desde el CRM anterior. No se empieza de cero ni se teclea dos veces.</p></div>
      <div class="card" style="background:#fff"><h3>3 · Configurar el embudo</h3><p>Una sesión de 60–90 minutos con las etapas reales del negocio, no las de fábrica.</p></div>
      <div class="card" style="background:#fff"><h3>4 · Formar al equipo</h3><p>Una hora: dónde mirar el lunes, cómo mover una oportunidad y cómo dejar escrita la siguiente tarea.</p></div>
    </div>

    <div class="big-card" style="margin-top:5mm">
      <div class="kicker" style="color:#1d4ed8">La prueba</div>
      <p style="font-size:9.4pt"><b>${TRIAL} días gratis, sin tarjeta y sin permanencia.</b> Se cancela desde facturación en un clic. Sin comisiones sobre tus ventas.</p>
      <div class="nota">La prueba incluye el nivel que se va a contratar, no una versión recortada.</div>
    </div>

    <h3 style="margin-top:6mm;font-size:11.4pt">Qué hace falta de cada lado</h3>
    <div class="cols2" style="gap:4mm 6mm;margin-top:2mm">
      <div class="card" style="background:#fff">
        <h3 style="font-size:9.6pt">De tu parte</h3>
        ${lista([
          '<b>Tu embudo real:</b> las etapas con las que se vende hoy, no las de fábrica.',
          '<b>Los contactos:</b> un archivo exportado o el acceso al CRM anterior.',
          '<b>Una hora del equipo</b> el primer día, para la formación.',
        ])}
      </div>
      <div class="card" style="background:#fff">
        <h3 style="font-size:9.6pt">De nuestra parte</h3>
        ${lista([
          '<b>La importación</b> de contactos, leads y oportunidades.',
          '<b>La configuración del embudo</b> y de las primeras reglas.',
          '<b>El acompañamiento de la primera semana</b>, revisando que se usa.',
        ], 'check')}
      </div>
    </div>
    <div class="quote" style="margin-top:5mm"><b>Al final de la primera semana</b> el equipo ya ha movido oportunidades y cerrado tareas. Eso es lo que se mide: no la configuración, sino si el viernes alguien lo abrió sin que se lo pidieran.</div>
    ${pie(11, 'CRM de Ventas · Puesta en marcha')}
  </section>`,

    /* 12 · Cierre ────────────────────────────────────────────────────── */
    `<section class="page cierre">
    <div class="cierre-inner">
      <div class="kicker">Para terminar</div>
      <h2>La venta no se pierde en el precio. <em>Se pierde en el seguimiento.</em></h2>
      <p style="margin-top:4mm;max-width:165mm">Cuando el comercial vuelve a llamar a tiempo, cuando el director sabe qué va a cerrar y cuando la propuesta no se queda en el olvido, el resultado cambia. Eso es lo que se lleva el equipo.</p>

      <div class="pasos">
        <div class="paso"><b>Paso 1</b><strong>Prueba</strong><span>${TRIAL} días con tus propios contactos. Sin tarjeta y sin permanencia.</span></div>
        <div class="paso"><b>Paso 2</b><strong>Mide</strong><span>Miramos juntos si el equipo lo ha usado: tareas cerradas, oportunidades movidas, propuestas seguidas.</span></div>
        <div class="paso"><b>Paso 3</b><strong>Decide</strong><span>Si encaja, se contrata el nivel que corresponda. Si no, se detiene sin coste y sin explicaciones.</span></div>
      </div>

      <div class="precio">
        <div class="cifra" style="flex:0 0 auto;white-space:nowrap">Hablemos</div>
        <div class="det">Una demo de quince minutos con tus datos, o una propuesta a medida para tu equipo.<br><b style="color:#e0f2fe">${CONTACTO}</b> · volkern.app</div>
      </div>

      <div class="check">
        <b>Lo que te llevas desde el primer día</b>
        <div class="cols2">
          <div>Embudo visual con previsión del mes.</div>
          <div>Ficha del cliente con el siguiente paso escrito.</div>
          <div>Propuestas con seguimiento de aperturas.</div>
          <div>Automatizaciones de reparto y recordatorio.</div>
          <div>Tus contactos importados, sin teclear dos veces.</div>
          <div>Roles y permisos por persona.</div>
        </div>
      </div>

      <div style="margin-top:10mm;border-top:1px solid rgba(148,163,184,.28);padding-top:8mm">
        <div style="font-size:7.6pt;letter-spacing:.2em;text-transform:uppercase;color:#67e8f9;font-weight:800">La idea que se queda</div>
        <div style="font-size:17pt;line-height:1.3;color:#e0f2fe;font-weight:700;max-width:162mm;margin-top:3mm;letter-spacing:-.01em">«No compro un CRM. Compro dejar de perder las ventas que ya tenía.»</div>
      </div>

      <div class="fin">
        <div><b>Volkern · CRM de Ventas</b><br>Dossier para el cliente · Octubre de 2026</div>
        <div style="max-width:76mm;text-align:right;font-size:6.8pt;line-height:1.5">Las pantallas muestran el panel con datos de demostración: los importes y nombres de los ejemplos son ficticios y no corresponden a ninguna cuenta real.</div>
      </div>
    </div>
  </section>`,
  ]
}

module.exports = { paginasCliente, CONTACTO }
