# 12. Catálogo de Inventarios (Maestro de Datos)

## 1. Nombre del hub
Gestión de Catálogo e Inventarios Maestros.

## 2. Propósito operativo
Es el corazón de los datos del producto. Aquí se configuran los bienes físicos, servicios, suscripciones y los metadatos necesarios (Pesos, dimensiones, Códigos SKU) que luego utilizarán Ventas, Logística y Producción.

## 3. Quién lo usa
- Gestores de Producto (Product Managers).
- Administradores de Precios (Pricing Team).
- Ingenieros de Datos (Para altas masivas).

## 4. Qué ve el usuario al entrar por primera vez
- Listado Maestro de SKU (Stock Keeping Units).
- Clasificaciones y Categorías.
- Panel de configuración de almacenes (`Warehouse`).
- Visor de estructura de variantes (Ej: Tallas, Colores).

## 5. Qué puede hacer
- Crear nuevos `CatalogoItem` indicando si son "Almacenables" (`isStockable`) o "Manufacturados" (`isManufactured`).
- Configurar precios base (`precioBase`) y reglas impositivas específicas por artículo.
- Subir imágenes, manuales PDF o fichas técnicas.
- Crear y archivar `Warehouses` (Ubicaciones Físicas de la empresa).

## 6. Qué no puede hacer
- **No puede alterar el stock disponible aquí.** Este hub define QUÉ se vende, no CUÁNTO hay. Las cantidades se manejan en el Logistics Hub.
- No puede borrar un producto que ya tenga un historial de ventas (Debe archivarlo o marcarlo como inactivo).

## 7. Qué ayudas necesita el administrador de tenant
- Soporte para ejecutar importaciones masivas de catálogos legacy vía CSV.
- Configurar la nomenclatura automática de SKUs.

## 8. Problemas o dudas frecuentes
- **"El producto no aparece en el CRM de ventas"**: Generalmente se debe a que está marcado como inactivo o no tiene un `precioBase` definido.
- **"Logística no puede recibir este producto"**: El ítem fue creado pero se olvidó marcar el flag `isStockable = true`.

## 9. Reglas de jerarquía y seguridad
- Solo el rol de "Gestor de Producto" o "SuperAdmin" puede cambiar `precioBase`. Un error aquí afectaría el Margin Guard de toda la empresa.

## 10. Flujo normal de uso
1. I+D aprueba un nuevo producto.
2. El Gestor de Catálogo entra al Hub y crea el `CatalogoItem`.
3. Sube la foto, define el Precio y activa `isManufactured = true`.
4. Deriva la receta al Hub de Producción para que le construyan una BoM (Bill of Materials).
5. El producto ya está disponible para todo el ecosistema.

## 11. Indicadores operativos importantes
- Total de SKUs activos vs inactivos.
- Frecuencia de actualización de catálogo.
- Productos sin descripciones o sin fotos (Data Quality Score).

## 12. Escalamiento cuando algo falla
1. Al intentar guardar un SKU y lanza error de "Duplicado", validar que el código no exista ya en los archivados.
2. Si las listas de precios personalizadas (PriceBooks) no se reflejan, depurar la caché de precios en Redis/Edge.

---

### Resumen para soporte y administración
1. **Es el Hub Cero:** Nada existe si no se crea primero aquí. 
2. **Definidor de Comportamiento:** Los flags booleanos (`isStockable`, `isManufactured`, `isService`) le dicen al orquestador (ATP/CTP) cómo debe tratar al producto. Si configuras mal los flags, rompes la automatización de ventas.
3. **Control Central de Precios:** `precioBase` es vital. Si no se cobra lo que se debe, este es el primer lugar a auditar.
4. **Archivo en lugar de Borrado:** Para mantener la integridad referencial histórica de ventas de hace años, nunca borres productos. Utiliza el botón "Archivar".
5. **Gestión de Almacenes Físicos:** El Catálogo también incluye el alta y baja de Edificios / Almacenes que usará logística.
