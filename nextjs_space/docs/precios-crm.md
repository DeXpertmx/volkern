# Precios de CRM & Ventas

Este documento fija **por qué** el CRM cuesta lo que cuesta y **dónde** se cambia.
La fuente única es [`lib/crm-pricing.ts`](../lib/crm-pricing.ts): la web, el
checkout, el dossier y los tests leen de ahí, así que no hay precios escritos a
mano en ningún otro sitio.

## 1. El principio: por usuario y por funciones

Un precio plano de 49 €/mes cobra lo mismo a un autónomo que a un equipo de 40
personas. La escalera actual separa las dos cosas que de verdad cuestan dinero:
**cuántas personas usan el CRM** y **qué necesitan hacer**.

| Nivel | Mensual | Anual (€/usuario/mes) | Para quién | Qué abre |
|---|---:|---:|---|---|
| Esencial | 15 € | **12 €** | 1–10 comerciales | 1 embudo, 2 automatizaciones, cotizaciones simples, informes básicos |
| Profesional | 29 € | **24 €** | 5–50 comerciales | Embudos ilimitados, contratos y firma, previsión por comercial |
| Avanzado | 49 € | **39 €** | 10+ comerciales | IA (siguiente acción y riesgo), roleplay, API y MCP, auditoría de IA |

El precio publicado «desde 12 €» es el Esencial con facturación anual. Las
puertas de cada nivel viven en [`lib/crm-entitlements.ts`](../lib/crm-entitlements.ts):
si una función se anuncia, se permite; si no, la ruta devuelve 403 con el nivel
que la desbloquea.

## 2. El volumen: tramos marginales, no un descuento único

Cada tramo descuenta **solo los usuarios que caen dentro de él**, como los
tramos de IRPF:

| Usuarios | Descuento del tramo |
|---|---:|
| 1–9 | 0 % |
| 10–24 | 10 % |
| 25–49 | 15 % |
| 50–99 | 20 % |
| 100–249 | 25 % |
| 250–499 | 30 % |
| 500–999 | 35 % |
| 1.000+ | 40 % |

Precio medio por usuario y mes (facturación anual), tal y como lo publica
`/precios`:

| Usuarios | Esencial | Profesional | Avanzado |
|---:|---:|---:|---:|
| 1 | 12,00 € | 24,00 € | 39,00 € |
| 5 | 12,00 € | 24,00 € | 39,00 € |
| 10 | 11,88 € | 23,76 € | 38,61 € |
| 25 | 11,21 € | 22,42 € | 36,43 € |
| 50 | 10,69 € | 21,38 € | 34,75 € |
| 100 | 10,14 € | 20,28 € | 32,96 € |
| 250 | 9,45 € | 18,91 € | 30,72 € |
| 500 | 8,93 € | 17,85 € | 29,01 € |
| 1.000 | 8,36 € | 16,72 € | 27,18 € |

**Por qué marginal y no «20 % a partir de 50»:** con descuento de todo o nada,
pasar de 99 a 100 usuarios *bajaba la factura*, porque el descuento se aplicaba
a los cien asientos a la vez. Es un acantilado que el cliente descubre solo y
que obliga a discutir el precio caso por caso. Con tramos marginales, añadir un
comercial siempre suma (poco) y el precio medio nunca sube. Hay un test que
recorre los 1.000 asientos de los tres niveles, en mensual y anual, y lo
comprueba: `tests/crm-pricing.test.ts`.

Hasta **1.000 asientos** se contrata en línea. Por encima, el precio es a
medida: entran en juego compromiso anual, SSO, soporte dedicado y condiciones de
contrato que no caben en un checkout.

## 3. Contraste con el mercado (consultado el 9 de agosto de 2026)

| Referencia | Precio de entrada | Qué enseña |
|---|---|---|
| **Vtiger One** | One Growth **12 $/usuario/mes** anual (15 $ mensual), One Professional 30 $, One Enterprise 42 $, One AI 50 $ | El precio de entrada ronda los 12 $ y **lo que cambia por nivel son funciones**, no asientos. Growth está topado a 15 usuarios, así que a partir de ahí se sube de edición. |
| **Odoo** | Standard **11,90 €/usuario/mes** anual (14,80 € mensual), Custom 22,90 € | Un precio por usuario con **todos los módulos incluidos**; el salto de plan añade Studio, IA y API. Sin tramos publicados por volumen. |
| **Pipedrive / Zoho CRM** | 14 € / 14 $ de entrada anual | El descuento grande que anuncian es por **pagar el año**, no por número de usuarios. |

Conclusión: nuestro Esencial a 12 € anual está en línea con Vtiger Growth y
Odoo Standard, y nuestros tramos de volumen son **más generosos** que lo que
publica cualquiera de ellos (que negocian fuera de tarifa a partir de ~200
asientos; la horquilla habitual de mercado es 15–30 % entre 200 y 1.000). Por
eso el CRM de Volkern puede decir «desde 12 €» sin mentir y, a la vez, tener un
precio real —no «hablemos»— para 100 y 1.000 usuarios.

Fuentes: [Vtiger pricing](https://www.vtiger.com/pricing/),
[Vtiger compare editions](https://www.vtiger.com/compare-editions/),
[Odoo pricing](https://www.odoo.com/pricing),
[Pipedrive pricing](https://www.pipedrive.com/en/pricing).

## 4. Qué NO está incluido en el precio

- **Impuestos.** Todos los importes son sin IVA.
- **Asientos de solo lectura.** Hoy todos los asientos son de acceso completo.
  Vtiger vende «Single App User» más barato para quien solo consulta; es la
  siguiente palanca natural para equipos de cientos de personas.
- **Implantación y migración.** Se presupuestan aparte.

## 5. Cómo se cambia

1. Edita `CRM_TIERS` (precio de lista) o `CRM_VOLUME_BANDS` (tramos) en
   [`lib/crm-pricing.ts`](../lib/crm-pricing.ts).
2. Actualiza la tabla de arriba (es documentación, no fuente de verdad) y, si
   cambian los precios acordados, el test de `tests/crm-pricing.test.ts` que los
   fija a propósito: un cambio de precio debe ser una decisión consciente, no un
   efecto colateral.
3. El checkout no necesita tocarse: calcula el importe del periodo y lo reparte
   entre los asientos en céntimos decimales (`unit_amount_decimal`), porque con
   tramos marginales el precio medio por asiento no siempre es un céntimo exacto.
4. Los tenants anteriores a la escalera conservan el nivel Avanzado completo
   (`legacy: true`). Bajar funciones a quien ya las pagaba no es parte del
   cambio de tarifa.
