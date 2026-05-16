-- User <-> Label join table for support group assignment
CREATE TABLE IF NOT EXISTS "UserLabel" (
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "labelId" UUID NOT NULL REFERENCES "Label"(id) ON DELETE CASCADE,
  PRIMARY KEY ("userId", "labelId")
);

CREATE INDEX IF NOT EXISTS idx_userlabel_user ON "UserLabel"("userId");
CREATE INDEX IF NOT EXISTS idx_userlabel_label ON "UserLabel"("labelId");

ALTER TABLE "UserLabel" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON "UserLabel" FOR ALL USING (true);
