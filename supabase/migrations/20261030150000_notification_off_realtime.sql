-- Take the Notification table off Supabase Realtime's change feed.
--
-- The app stopped listening to row changes on 10 Oct 2026 (polling load-shedding handoff); it reads the bell by
-- polling (`my_notifications_signal`). The feed was the largest single cost on the database (about 43% of its time
-- since February), most likely from old installed copies still listening. With no table published, Realtime has
-- nothing to decode. Broadcast channels (hub meeting prayer focus, training attendance) do not use this publication.
--
-- Rollback: ALTER PUBLICATION supabase_realtime ADD TABLE public."Notification";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Notification') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public."Notification";
  END IF;
END $$;
