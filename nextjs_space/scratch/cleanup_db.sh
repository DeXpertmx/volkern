export DATABASE_URL="postgresql://neondb_owner:npg_qi4kcVBa1vUR@ep-withered-mode-al6o4sjg-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"
psql -c "UPDATE \"Tenant\" SET \"dbUrl\" = NULL;"
