export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
};

// Validation au démarrage : les variables critiques doivent être définies
const REQUIRED_IN_PRODUCTION = ['JWT_SECRET', 'DATABASE_URL', 'OAUTH_SERVER_URL'] as const;
if (ENV.isProduction) {
  const missing = REQUIRED_IN_PRODUCTION.filter(key => {
    const envKey = key === 'JWT_SECRET' ? 'cookieSecret' : key === 'DATABASE_URL' ? 'databaseUrl' : 'oAuthServerUrl';
    return !ENV[envKey as keyof typeof ENV];
  });
  if (missing.length > 0) {
    console.error(`[ENV] Variables d'environnement manquantes en production: ${missing.join(', ')}`);
    process.exit(1);
  }
} else {
  // En développement, avertir seulement
  if (!ENV.cookieSecret) console.warn('[ENV] JWT_SECRET non défini — sessions non sécurisées');
  if (!ENV.databaseUrl) console.warn('[ENV] DATABASE_URL non défini — base de données indisponible');
}
