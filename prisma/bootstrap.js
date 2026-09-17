const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('child_process');

const prisma = new PrismaClient();
const APP_ROOT = path.resolve(__dirname, '..');

const LEGACY_MIGRATIONS = [
  '20260812143457_init',
  '20260829153000_simplify_to_hkd_only',
  '20260829170000_add_contracts_and_record_details',
  '20260830143000_add_private_ledger_and_activities',
];

const NEW_PROGRAMMATIC_MIGRATIONS = [
  '20260831182000_mobile_ux_ocr_reminders_systemsetting',
];

function run(cmd, args) {
  console.log(`[bootstrap] $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: APP_ROOT,
    env: process.env,
  });
  if (result.error) {
    console.error(`[bootstrap] spawn error: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

async function columnExists(tableName, columnName) {
  try {
    const rows =
      await prisma.$queryRaw`SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${columnName}
      ) as "exists"`;
    return !!(rows && rows[0] && rows[0].exists);
  } catch (e) {
    console.warn(`[bootstrap] columnExists(${tableName}, ${columnName}) failed: ${e && e.message}`);
    return false;
  }
}

async function tableExists(tableName) {
  try {
    const rows =
      await prisma.$queryRaw`SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
      ) as "exists"`;
    return !!(rows && rows[0] && rows[0].exists);
  } catch (e) {
    console.warn(`[bootstrap] tableExists(${tableName}) failed: ${e && e.message}`);
    return false;
  }
}

async function getMigrationRows() {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT migration_name, started_at, finished_at, rolled_back_at FROM _prisma_migrations`,
    );
  } catch (_e) {
    return [];
  }
}

function isApplied(row) {
  // finished_at is set on success; absence of rolled_back_at is not sufficient.
  return !!(row && row.finished_at && !row.rolled_back_at);
}

function isFailed(row) {
  // Started running but never finished, and not marked rolled back.
  return !!(row && row.started_at && !row.finished_at && !row.rolled_back_at);
}

async function resetFailedMigrations() {
  const rows = await getMigrationRows();
  const failed = rows.filter(isFailed);
  if (failed.length === 0) {
    console.log('[bootstrap] No failed/pending migrations found.');
    return;
  }
  console.log(
    `[bootstrap] Found ${failed.length} failed/pending migrations. Resolving each as --rolled-back.`,
  );
  for (const r of failed) {
    run('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', r.migration_name]);
  }
}

async function markAppliedIfMissing(names) {
  const rows = await getMigrationRows();
  const byName = new Map(rows.map((r) => [r.migration_name, r]));
  for (const name of names) {
    const row = byName.get(name);
    if (!isApplied(row)) {
      run('npx', ['prisma', 'migrate', 'resolve', '--applied', name]);
    }
  }
}

async function execSafe(label, sql) {
  console.log(`[bootstrap] -> ${label} ...`);
  try {
    const result = await prisma.$executeRawUnsafe(sql);
    console.log(`[bootstrap]    ${label} OK (raw result: ${JSON.stringify(result)})`);
    return true;
  } catch (e) {
    const msg = (e && e.message) || String(e);
    console.warn(`[bootstrap]    ${label} skipped/non-fatal: ${msg}`);
    return false;
  }
}

async function applyProgrammaticDDL() {
  const before = {
    SystemSetting: await tableExists('SystemSetting'),
    UserOcrEnabled: await columnExists('User', 'ocrEnabled'),
    PrivateCustomCategory: await columnExists('PrivateRecord', 'customCategory'),
    ContractReminderDays: await columnExists('Contract', 'reminderDays'),
    ContractCategoryId: await columnExists('Contract', 'categoryId'),
  };
  console.log(
    `[bootstrap] Pre-DDL state: ${JSON.stringify(before)}`,
  );

  // Step 1: User.ocrEnabled
  if (!before.UserOcrEnabled) {
    await execSafe(
      'ALTER TABLE "User" ADD COLUMN "ocrEnabled" BOOLEAN NOT NULL DEFAULT true',
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ocrEnabled" BOOLEAN NOT NULL DEFAULT true`,
    );
  } else {
    console.log('[bootstrap] -> User.ocrEnabled already exists; skipping.');
  }

  // Step 2: PrivateRecord.customCategory
  if (!before.PrivateCustomCategory) {
    await execSafe(
      'ALTER TABLE "PrivateRecord" ADD COLUMN "customCategory" TEXT',
      `ALTER TABLE "PrivateRecord" ADD COLUMN IF NOT EXISTS "customCategory" TEXT`,
    );
  } else {
    console.log('[bootstrap] -> PrivateRecord.customCategory already exists; skipping.');
  }

  // Step 3: Contract.reminderDays
  if (!before.ContractReminderDays) {
    await execSafe(
      'ALTER TABLE "Contract" ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 15',
      `ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "reminderDays" INTEGER NOT NULL DEFAULT 15`,
    );
  } else {
    console.log('[bootstrap] -> Contract.reminderDays already exists; skipping.');
  }

  // Step 4: Contract.categoryId nullable
  if (before.ContractCategoryId) {
    try {
      const nullableRows =
        await prisma.$queryRaw`SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='Contract' AND column_name='categoryId'`;
      const isNullable = nullableRows && nullableRows[0] && nullableRows[0].is_nullable === 'YES';
      if (!isNullable) {
        await execSafe(
          'ALTER TABLE "Contract" ALTER COLUMN "categoryId" DROP NOT NULL',
          `ALTER TABLE "Contract" ALTER COLUMN "categoryId" DROP NOT NULL`,
        );
      } else {
        console.log('[bootstrap] -> Contract.categoryId already nullable; skipping.');
      }
    } catch (e) {
      console.warn(
        `[bootstrap]    Could not inspect Contract.categoryId nullable state: ${e && e.message}`,
      );
    }
  }

  // Step 5: SystemSetting table + unique index
  if (!before.SystemSetting) {
    await execSafe(
      'CREATE TABLE "SystemSetting" (...)',
      `CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "id" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
      )`,
    );
    await execSafe(
      'CREATE UNIQUE INDEX "SystemSetting_key_key"',
      `CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" ON "SystemSetting"("key")`,
    );
  } else {
    console.log('[bootstrap] -> SystemSetting table already exists; skipping.');
    try {
      await execSafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" (safety)',
        `CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" ON "SystemSetting"("key")`,
      );
    } catch (_e) {
      /* ignore */
    }
  }

  // Step 6: ReminderEmailLog table
  const hasReminderEmailLog = await tableExists('ReminderEmailLog');
  if (!hasReminderEmailLog) {
    await execSafe(
      'CREATE TABLE "ReminderEmailLog" (...)',
      `CREATE TABLE IF NOT EXISTS "ReminderEmailLog" (
        "id" TEXT NOT NULL,
        "entityType" TEXT NOT NULL,
        "entityId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "anchorDate" TEXT NOT NULL,
        "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "toEmails" TEXT NOT NULL,
        "subject" TEXT,
        "status" TEXT NOT NULL DEFAULT 'SENT',
        "error" TEXT,
        CONSTRAINT "ReminderEmailLog_pkey" PRIMARY KEY ("id")
      )`,
    );
    await execSafe(
      'CREATE UNIQUE INDEX ReminderEmailLog unique key',
      `CREATE UNIQUE INDEX IF NOT EXISTS "ReminderEmailLog_entityType_entityId_kind_anchorDate_key" ON "ReminderEmailLog"("entityType", "entityId", "kind", "anchorDate")`,
    );
    await execSafe(
      'CREATE INDEX ReminderEmailLog entity idx',
      `CREATE INDEX IF NOT EXISTS "ReminderEmailLog_entityType_entityId_idx" ON "ReminderEmailLog"("entityType", "entityId")`,
    );
  } else {
    console.log('[bootstrap] -> ReminderEmailLog table already exists; skipping.');
  }

  const after = {
    SystemSetting: await tableExists('SystemSetting'),
    ReminderEmailLog: await tableExists('ReminderEmailLog'),
    UserOcrEnabled: await columnExists('User', 'ocrEnabled'),
    PrivateCustomCategory: await columnExists('PrivateRecord', 'customCategory'),
    ContractReminderDays: await columnExists('Contract', 'reminderDays'),
  };
  console.log(`[bootstrap] Post-DDL state: ${JSON.stringify(after)}`);
  return after;
}

async function main() {
  console.log('[bootstrap] ===============================================================');
  console.log('[bootstrap] bootstrap.js entry: baseline legacy migrations -> DDL -> migrate deploy -> start Next.js');
  console.log('[bootstrap] ===============================================================');

  const rows = await getMigrationRows();
  console.log(`[bootstrap] _prisma_migrations rows present: ${rows.length}`);
  for (const r of rows) {
    console.log(
      `[bootstrap]   - ${r.migration_name}  started=${!!r.started_at}  finished=${!!r.finished_at}  rolled_back=${!!r.rolled_back_at}`,
    );
  }

  // 1. Legacy baseline (tables exist but no _prisma_migrations rows).
  const hasPrivateRecord = await tableExists('PrivateRecord');
  if (hasPrivateRecord) {
    console.log(
      '[bootstrap] Legacy tables detected (PrivateRecord exists). Marking first 4 migrations as --applied if missing.',
    );
    await markAppliedIfMissing(LEGACY_MIGRATIONS);
  }

  // 2. Reset any failed rows (P3009).
  await resetFailedMigrations();

  // 3. Apply programmatic DDL for the new migration (5 individual steps).
  await applyProgrammaticDDL();

  // 4. Mark the new migration applied.
  await markAppliedIfMissing(NEW_PROGRAMMATIC_MIGRATIONS);

  // 5. Final prisma migrate deploy pass.
  console.log('[bootstrap] Running prisma migrate deploy (final verification pass)...');
  run('npx', ['prisma', 'migrate', 'deploy']);

  await prisma.$disconnect();

  console.log('[bootstrap] Migrations OK. Starting Next.js server (require server.js).');
  require(path.join(APP_ROOT, 'server.js'));
}

main().catch(async (e) => {
  console.error('[bootstrap] ===============================================================');
  console.error('[bootstrap] FATAL bootstrap error:', e);
  console.error('[bootstrap] ===============================================================');
  try {
    await prisma.$disconnect();
  } catch (_e) {
    /* ignore */
  }
  process.exit(1);
});
