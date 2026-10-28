// Etapa de build: registra QUAIS variáveis existiam durante o build, nunca os valores.
// BUILD_ONLY deve existir aqui; E2E_TOKEN (só runtime) não.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const fingerprint = (v) => (v ? createHash('sha256').update(v).digest('hex').slice(0, 12) : null);

const info = {
  builtAt: new Date().toISOString(),
  buildOnlyPresent: !!process.env.BUILD_ONLY,
  buildOnlyFingerprint: fingerprint(process.env.BUILD_ONLY),
  runtimeOnlyPresent: !!process.env.E2E_TOKEN,
  databaseUrlPresent: !!process.env.DATABASE_URL,
};
writeFileSync('build-info.json', JSON.stringify(info, null, 2));
console.log('build-info.json gravado (só presença e impressão digital, sem valores)');
