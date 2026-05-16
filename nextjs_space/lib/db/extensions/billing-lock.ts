import { Prisma } from '@prisma/client';

/**
 * Extensión billingLock: Blindaje Veri*factu
 */
export const billingLockExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: 'billingLock',
    query: {
      invoice: {
        async update({ args, query }) {
          // Buscamos la factura usando el cliente base para evitar recursión infinita
          // findUnique NO está interceptado por este hook, así que es seguro.
          const invoice = await (client as any).invoice.findUnique({
            where: args.where
          });
          
          if (invoice?.isSealed) {
            // Campos críticos que NO pueden cambiarse bajo ninguna circunstancia
            const criticalFields = ['monto', 'moneda', 'fechaEmision', 'numero', 'tenantId', 'fingerprint', 'parentFingerprint'];
            const attemptedChanges = Object.keys(args.data);
            const violation = attemptedChanges.find(field => criticalFields.includes(field));

            if (violation) {
              throw new Error(`SECURITY_VIOLATION: No se puede modificar el campo crítico '${violation}' en una factura sellada.`);
            }

            // Si llegamos aquí, los cambios son permitidos (ej. estado, fiscalStatus, metadata)
          }
          return query(args);
        },
        async delete({ args, query }) {
          const invoice = await (client as any).invoice.findUnique({
            where: args.where
          });
          
          if (invoice?.isSealed) {
            throw new Error('SECURITY_VIOLATION: Operación de borrado denegada. Las facturas son inmutables.');
          }
          return query(args);
        },
        // Bloqueo para actualizaciones masivas (updateMany/deleteMany)
        async updateMany({ args, query }) {
          throw new Error('SECURITY_VIOLATION: Actualización masiva denegada en el módulo de facturación.');
        },
        async deleteMany({ args, query }) {
          throw new Error('SECURITY_VIOLATION: Borrado masivo denegado en el módulo de facturación.');
        }
      }
    }
  });
});
