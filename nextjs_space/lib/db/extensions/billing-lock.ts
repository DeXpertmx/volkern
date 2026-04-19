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
            throw new Error('SECURITY_VIOLATION: No se puede modificar una factura sellada (Veri*factu Compliance).');
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
