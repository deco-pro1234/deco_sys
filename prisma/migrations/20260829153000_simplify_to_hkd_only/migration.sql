-- Simplify the domain model to:
-- 1. income/expense only
-- 2. HKD-only settlement
-- 3. no consolidated orders or AR/AP remark logs

-- Remove data that no longer fits the product model before dropping columns.
DELETE FROM "Record"
WHERE "type" IN ('AR', 'AP') OR "currency" <> 'HKD';

DROP TABLE IF EXISTS "RemarkLog";

ALTER TABLE "Record"
  DROP COLUMN IF EXISTS "executionDate",
  DROP COLUMN IF EXISTS "currency",
  DROP COLUMN IF EXISTS "orderId";

ALTER TABLE "CapitalPool"
  DROP COLUMN IF EXISTS "balanceRmb";

DROP TABLE IF EXISTS "ConsolidatedOrder";
