// Carga .env.local antes de que el helper de base de datos lea DATABASE_OWNER_URL (los imports se evalúan en orden).
process.loadEnvFile(".env.local");
