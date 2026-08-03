/**
 * Regla ESLint: `eslint-rules/no-hardcoded-currency-fallback`.
 *
 * Bloquea el hardcode de la cadena literal "MXN" en posiciones de **fallback**
 * dentro de los archivos del vertical Seguros (portfolio ejecutivo, forecast,
 * multi-ramo, smart-forecast, etc.).
 *
 * Posiciones detectadas:
 *   1. Default parameter value            → `function f(x = 'MXN')`
 *   2. Right operand de `??` o `||`        → `tenant?.moneda ?? 'MXN'`
 *   3. Consequent o alternate de ternario   → `cond ? 'MXN' : other`
 *
 * Posiciones NO detectadas (casos legítimos donde el broker elige MXN como
 * opción, e.g. el `<SelectItem value="MXN">` del formulario de pólizas):
 *   • JSXAttribute con literal "MXN" (selector de moneda visible al usuario).
 *   • Property value estático `currency: 'MXN'` (configuración inmutable).
 *
 * Por qué solo en apparel/api/insurance/portfolio/* y components/insurance/*:
 *   Limitamos el alcance para no romper otros verticales (real-estate, finanz
 * as, etc.) que puedan seguir usando MXN para clientes mexicanos sin que
 * tengamos un campo `tenant.moneda` equivalente.
 *
 * Mensaje: indica la alternativa correcta según el contexto (route vs
 * component) y cómo importar el default global legítimo vía currency.ts.
 */
'use strict';

const MESSAGE_ID = 'hardcodedMxn';
const MESSAGE =
  'No hardcodear el fallback de moneda a "MXN". Usa `tenant.moneda` (en routes) o `snapshot.tenantMoneda`/prop explícita (en componentes). Para un default global legítimo, importa `CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY` desde "@/lib/insurance/currency".';

/** Devuelve true si el nodo es un literal de cadena cuyo valor es "MXN". */
function isMxnLiteral(node) {
  if (!node) return false;
  if (node.type === 'Literal' && typeof node.value === 'string' && node.value === 'MXN') {
    return true;
  }
  if (
    node.type === 'TemplateElement' &&
    node.value &&
    typeof node.value.cooked === 'string' &&
    node.value.cooked === 'MXN'
  ) {
    return true;
  }
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded "MXN" currency fallback in insurance portfolio routes/components',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: null,
    schema: [],
    messages: {
      [MESSAGE_ID]: MESSAGE,
    },
  },

  create(context) {
    return {
      // 1) Default parameter value: `function f(x = 'MXN')`.
      AssignmentPattern(node) {
        if (isMxnLiteral(node.right)) {
          context.report({ node: node.right, messageId: MESSAGE_ID });
        }
      },

      // 2) Fallback con `??` o `||`: `x ?? 'MXN'`, `x || 'MXN'`.
      LogicalExpression(node) {
        if (node.operator !== '??' && node.operator !== '||') return;
        if (isMxnLiteral(node.right)) {
          context.report({ node: node.right, messageId: MESSAGE_ID });
        }
      },

      // 3) Ternario con 'MXN' en cualquier rama: `cond ? 'MXN' : other`.
      ConditionalExpression(node) {
        if (isMxnLiteral(node.consequent)) {
          context.report({ node: node.consequent, messageId: MESSAGE_ID });
        }
        if (isMxnLiteral(node.alternate)) {
          context.report({ node: node.alternate, messageId: MESSAGE_ID });
        }
      },
    };
  },
};
