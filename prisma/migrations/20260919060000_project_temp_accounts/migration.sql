-- Project-plugin temporary accounts (login by username or phone; no other modules)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountKind" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginPhone" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_loginPhone_key" ON "User"("loginPhone");
CREATE INDEX IF NOT EXISTS "User_accountKind_idx" ON "User"("accountKind");
CREATE INDEX IF NOT EXISTS "User_roleName_idx" ON "User"("roleName");
