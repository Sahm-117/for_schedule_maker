-- Durable participant handover context. Participant records remain the source
-- of truth; these tables preserve who worked with a participant as assignments
-- change and retain attributed support notes.

CREATE TABLE IF NOT EXISTS "ParticipantHandover" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "eventType" TEXT NOT NULL CHECK ("eventType" IN ('GROUP_JOINED', 'GROUP_LEFT', 'SUPPORT_REASSIGNED')),
  "fromGroupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL,
  "fromGroupName" TEXT,
  "fromSupportId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "fromSupportName" TEXT,
  "toGroupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL,
  "toGroupName" TEXT,
  "toSupportId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "toSupportName" TEXT,
  "faithProjectStatus" TEXT,
  "faithProjectUpdatedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "faithProjectUpdatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participanthandover_participant_created
  ON "ParticipantHandover"("participantId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ParticipantNote" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  "authorId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "groupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL,
  "weekId" INTEGER REFERENCES "Week"(id) ON DELETE SET NULL,
  "noteType" TEXT NOT NULL DEFAULT 'HANDOVER' CHECK ("noteType" IN ('HANDOVER', 'MEETING')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participantnote_participant_created
  ON "ParticipantNote"("participantId", "createdAt" DESC);

-- This app uses custom authentication rather than Supabase Auth. Keep RLS
-- consistent with the rest of the operational schema; client APIs scope the
-- support views to their assigned groups.
ALTER TABLE "ParticipantHandover" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantHandover";
CREATE POLICY "Allow all operations" ON "ParticipantHandover" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "ParticipantNote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantNote";
CREATE POLICY "Allow all operations" ON "ParticipantNote" FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.capture_participant_handover(
  p_participant_id UUID,
  p_event_type TEXT,
  p_from_group_id UUID DEFAULT NULL,
  p_to_group_id UUID DEFAULT NULL,
  p_from_support_id UUID DEFAULT NULL,
  p_to_support_id UUID DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from_group_name TEXT;
  v_to_group_name TEXT;
  v_from_support_name TEXT;
  v_to_support_name TEXT;
  v_project RECORD;
BEGIN
  SELECT name INTO v_from_group_name FROM "Group" WHERE id = p_from_group_id;
  SELECT name INTO v_to_group_name FROM "Group" WHERE id = p_to_group_id;
  SELECT name INTO v_from_support_name FROM "User" WHERE id = p_from_support_id;
  SELECT name INTO v_to_support_name FROM "User" WHERE id = p_to_support_id;
  SELECT status, "updatedById", "updatedAt" INTO v_project
    FROM "FaithProject" WHERE "participantId" = p_participant_id ORDER BY "updatedAt" DESC NULLS LAST LIMIT 1;

  INSERT INTO "ParticipantHandover" (
    "participantId", "eventType", "fromGroupId", "fromGroupName", "fromSupportId", "fromSupportName",
    "toGroupId", "toGroupName", "toSupportId", "toSupportName", "faithProjectStatus", "faithProjectUpdatedById", "faithProjectUpdatedAt"
  ) VALUES (
    p_participant_id, p_event_type, p_from_group_id, v_from_group_name, p_from_support_id, v_from_support_name,
    p_to_group_id, v_to_group_name, p_to_support_id, v_to_support_name,
    v_project.status, v_project."updatedById", v_project."updatedAt"
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_group_participant_handover()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group "Group"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v_group FROM "Group" WHERE id = OLD."groupId";
    PERFORM public.capture_participant_handover(OLD."participantId", 'GROUP_LEFT', OLD."groupId", NULL, v_group."supportId", NULL);
    RETURN OLD;
  END IF;
  SELECT * INTO v_group FROM "Group" WHERE id = NEW."groupId";
  PERFORM public.capture_participant_handover(NEW."participantId", 'GROUP_JOINED', NULL, NEW."groupId", NULL, v_group."supportId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participant_handover_on_group_member ON "GroupParticipant";
CREATE TRIGGER participant_handover_on_group_member
AFTER INSERT OR DELETE ON "GroupParticipant"
FOR EACH ROW EXECUTE FUNCTION public.log_group_participant_handover();

CREATE OR REPLACE FUNCTION public.log_group_support_handover()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_participant RECORD;
BEGIN
  IF OLD."supportId" IS NOT DISTINCT FROM NEW."supportId" THEN RETURN NEW; END IF;
  FOR v_participant IN SELECT "participantId" FROM "GroupParticipant" WHERE "groupId" = NEW.id LOOP
    PERFORM public.capture_participant_handover(v_participant."participantId", 'SUPPORT_REASSIGNED', NEW.id, NEW.id, OLD."supportId", NEW."supportId");
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participant_handover_on_group_support ON "Group";
CREATE TRIGGER participant_handover_on_group_support
AFTER UPDATE OF "supportId" ON "Group"
FOR EACH ROW EXECUTE FUNCTION public.log_group_support_handover();

REVOKE ALL ON FUNCTION public.capture_participant_handover(UUID, TEXT, UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_group_participant_handover() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_group_support_handover() FROM PUBLIC;
