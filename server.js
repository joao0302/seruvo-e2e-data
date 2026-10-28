// Aplicação de teste E2E do Seruvo. Nunca devolve valores de variáveis nem a senha do banco.
// Rotas (exceto /healthz) exigem o cabeçalho x-e2e-token igual a E2E_TOKEN (variável só de runtime).
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import pg from 'pg';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const COUNTER = join(DATA_DIR, 'counter.json');
const fingerprint = (v) => (v ? createHash('sha256').update(v).digest('hex').slice(0, 12) : null);

const buildInfo = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./build-info.json', import.meta.url), 'utf8'));
  } catch {
    return null;
  }
})();

let pool = null;
function db() {
  if (!process.env.DATABASE_URL) return null;
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
  return pool;
}

/** Só o necessário para provar a rede privada: host, porta, banco e usuário (sem senha). */
function databaseTarget() {
  if (!process.env.DATABASE_URL) return null;
  const u = new URL(process.env.DATABASE_URL);
  return { host: u.hostname, port: Number(u.port || 5432), database: u.pathname.slice(1), user: u.username };
}

function authorized(req) {
  const expected = process.env.E2E_TOKEN;
  const given = req.headers['x-e2e-token'];
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(createHash('sha256').update(given).digest());
  const b = Buffer.from(createHash('sha256').update(expected).digest());
  return timingSafeEqual(a, b);
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const routes = {
  'GET /healthz': async () => [200, { status: 'ok', app: 'seruvo-e2e-data' }],

  'GET /env/check': async () => [
    200,
    {
      build: buildInfo,
      runtime: {
        buildOnlyPresent: !!process.env.BUILD_ONLY,
        runtimeOnlyPresent: !!process.env.E2E_TOKEN,
        runtimeOnlyFingerprint: fingerprint(process.env.E2E_TOKEN),
        databaseUrlPresent: !!process.env.DATABASE_URL,
      },
    },
  ],

  // Somente leitura: SELECT 1 e contagem (sem criar nada).
  'GET /db/status': async () => {
    const p = db();
    if (!p) return [503, { ok: false, error: 'DATABASE_URL ausente' }];
    const one = await p.query('select 1 as one, current_database() as db, version() as version');
    const exists = await p.query("select to_regclass('public.e2e_records') is not null as exists");
    let count = 0;
    let latest = null;
    if (exists.rows[0].exists) {
      const r = await p.query('select count(*)::int as count, max(created_at) as latest from e2e_records');
      count = r.rows[0].count;
      latest = r.rows[0].latest;
    }
    return [
      200,
      {
        ok: one.rows[0].one === 1,
        target: databaseTarget(),
        database: one.rows[0].db,
        server: String(one.rows[0].version).split(' ').slice(0, 2).join(' '),
        table: exists.rows[0].exists,
        count,
        latest,
      },
    ];
  },

  'POST /db/write': async () => {
    const p = db();
    if (!p) return [503, { ok: false, error: 'DATABASE_URL ausente' }];
    await p.query(
      'create table if not exists e2e_records (id serial primary key, note text not null, created_at timestamptz not null default now())',
    );
    await p.query('insert into e2e_records (note) values ($1)', [`e2e ${new Date().toISOString()}`]);
    const r = await p.query('select count(*)::int as count from e2e_records');
    return [201, { ok: true, count: r.rows[0].count }];
  },

  // Somente leitura do contador no volume.
  'GET /file/status': async () => {
    if (!existsSync(COUNTER)) return [200, { exists: false, counter: 0, dir: DATA_DIR }];
    const { counter, updatedAt } = JSON.parse(readFileSync(COUNTER, 'utf8'));
    return [200, { exists: true, counter, updatedAt, dir: DATA_DIR }];
  },

  'POST /file/write': async () => {
    mkdirSync(DATA_DIR, { recursive: true });
    const current = existsSync(COUNTER) ? JSON.parse(readFileSync(COUNTER, 'utf8')).counter : 0;
    const next = { counter: current + 1, updatedAt: new Date().toISOString() };
    // Escrita atômica: arquivo temporário + rename.
    writeFileSync(`${COUNTER}.tmp`, JSON.stringify(next));
    renameSync(`${COUNTER}.tmp`, COUNTER);
    return [201, { exists: true, ...next, dir: DATA_DIR }];
  },
};

export const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const handler = routes[`${req.method} ${path}`];
  if (!handler) return send(res, 404, { error: 'not found' });
  if (path !== '/healthz' && !authorized(req)) return send(res, 401, { error: 'unauthorized' });
  try {
    const [status, body] = await handler();
    send(res, status, body);
  } catch (error) {
    // Mensagem do erro sem a URL do banco (o driver não a inclui; por garantia, remove a senha).
    const message = String(error?.message ?? error).replaceAll(
      process.env.DATABASE_URL ?? '\u0000',
      '[DATABASE_URL]',
    );
    console.error('erro na rota', path, message);
    send(res, 500, { ok: false, error: message });
  }
});

if (process.argv.includes('--seruvo-e2e-data')) {
  server.listen(PORT, () => console.log(`seruvo-e2e-data ouvindo na porta ${PORT}`));
}
