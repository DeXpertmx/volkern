#!/bin/bash
# ==============================================================================
# restore_volkern.sh — Protocolo de Recuperación en 1 Clic
# ==============================================================================
# Este script descarga el último backup desde S3 y restaura el sistema.
# ==============================================================================

if [ -z "$1" ]; then
    echo "Uso: ./restore_volkern.sh <nombre_del_backup.tar.gz>"
    echo "Efecto: Restaura base de datos y archivos desde el punto indicado."
    exit 1
fi

BACKUP_FILE=$1
TEMP_RESTORE_DIR="/tmp/volkern_restore"
DB_CONTAINER="volkern_postgres"
DB_NAME="volkern_local"
DB_USER="postgres"

mkdir -p $TEMP_RESTORE_DIR
echo "[$(date)] 🚑 Iniciando Recuperación de Emergencia: $BACKUP_FILE"

# 1. Descarga (Descomentada si usas rclone/aws)
# echo "[$(date)] ⬇️ Descargando de S3..."
# rclone copy s3_volkern:backups/$BACKUP_FILE $TEMP_RESTORE_DIR/

# 2. Descomprimir
echo "[$(date)] 📦 Descomprimiendo archivos..."
tar -xzvf $BACKUP_FILE -C $TEMP_RESTORE_DIR

# Localizar archivo SQL
SQL_FILE=$(find $TEMP_RESTORE_DIR -name "*.sql" | head -n 1)

if [ -z "$SQL_FILE" ]; then
    echo "❌ No se encontró archivo SQL en el backup."
    exit 1
fi

# 3. Restaurar Base de Datos
echo "[$(date)] 🐘 Restaurando PostgreSQL (esto sobreescribirá datos actuales)..."
cat $SQL_FILE | docker exec -i $DB_CONTAINER psql -U $DB_USER $DB_NAME

# 4. Restaurar Volúmenes (Ejemplo de rsync a volumen docker)
# echo "[$(date)] 📁 Restaurando volúmenes de archivos..."
# cp -r $TEMP_RESTORE_DIR/volumenes/* /var/lib/docker/volumes/volkern_media/_data/

echo "[$(date)] ✅ Sistema restaurado. Se recomienda reiniciar servicios."
echo "docker-compose restart nextjs_app"

# Limpieza
rm -rf $TEMP_RESTORE_DIR
exit 0
