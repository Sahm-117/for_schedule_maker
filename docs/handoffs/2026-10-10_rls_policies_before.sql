-- Row-level-security policies as they were BEFORE 20261010140000_rls_wrap_helper_calls.sql.
-- Running this file puts every policy back exactly (rollback). Not a migration: do not add to supabase/migrations.
ALTER POLICY "Allow all operations" ON public."Activity" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ActivityLabel" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ActivityTeam" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."Announcement" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."AppSetting" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Admins can read attendance excusals" ON public."AttendanceExcusal" USING (app_is_admin());
ALTER POLICY "Staff can read attendance follow-up tasks" ON public."AttendanceFollowUpTask" USING (app_is_staff());
ALTER POLICY "Staff can read attendance records" ON public."AttendanceRecord" USING (app_is_staff());
ALTER POLICY "Staff can read attendance sessions" ON public."AttendanceSession" USING (app_is_staff());
ALTER POLICY "Staff can read church events" ON public."ChurchEvent" USING (app_is_staff());
ALTER POLICY "Allow all operations" ON public."Cohort" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."CoverRequest" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."Day" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."DepartmentReferral" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Staff can manage faith help requests" ON public."FaithHelpRequest" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."FaithProject" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Admins manage faith project categories" ON public."FaithProjectCategory" USING (app_is_admin()) WITH CHECK (app_is_admin());
ALTER POLICY "Staff can read faith project categories" ON public."FaithProjectCategory" USING (app_is_staff());
ALTER POLICY "Admins manage faith project settings" ON public."FaithProjectSetting" USING (app_is_admin()) WITH CHECK (app_is_admin());
ALTER POLICY "Staff can read faith project settings" ON public."FaithProjectSetting" USING (app_is_staff());
ALTER POLICY "Staff can read faith project versions" ON public."FaithProjectVersion" USING (app_is_staff());
ALTER POLICY "Allow all operations" ON public."FaithThreadRead" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."FollowUpContact" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."FollowUpIssue" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."FollowUpIssueContact" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Staff can read login issues" ON public."FollowUpLoginIssue" USING (app_is_staff());
ALTER POLICY "Staff read note history" ON public."FollowUpNoteHistory" USING (app_is_staff());
ALTER POLICY "Allow all operations" ON public."Group" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."GroupOnboardingStatus" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."GroupParticipant" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."GroupPrayer" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."GroupPrayerFocus" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."GroupPrayerStatus" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."HubComment" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Admins manage hub it supports" ON public."HubItSupport" USING (app_is_admin()) WITH CHECK (app_is_admin());
ALTER POLICY "Staff can read hub it supports" ON public."HubItSupport" USING (app_is_staff());
ALTER POLICY "Admins manage hub memberships" ON public."HubMembership" USING (app_is_admin()) WITH CHECK (app_is_admin());
ALTER POLICY "Staff can read hub memberships" ON public."HubMembership" USING (app_is_staff());
ALTER POLICY "Hub members and admin can read hub messages" ON public."HubMessage" USING ((app_is_admin() OR (EXISTS ( SELECT 1
   FROM "HubMembership" m
  WHERE ((m."hubId" = "HubMessage"."hubId") AND (m."userId" = app_current_user_id()))))));
ALTER POLICY "Hub members and admin can read acks" ON public."HubMessageAck" USING ((app_is_admin() OR (EXISTS ( SELECT 1
   FROM ("HubMessage" msg
     JOIN "HubMembership" m ON (((m."hubId" = msg."hubId") AND (m."userId" = app_current_user_id()))))
  WHERE (msg.id = "HubMessageAck"."messageId")))));
ALTER POLICY "Admins manage hub people of interest" ON public."HubPersonOfInterest" USING (app_is_admin()) WITH CHECK (app_is_admin());
ALTER POLICY "Allow all operations" ON public."HubReaction" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."HubReply" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Caller and admin can read own role intro seen" ON public."HubRoleIntroSeen" USING ((app_is_admin() OR ("userId" = app_current_user_id())));
ALTER POLICY "Allow all operations" ON public."HubTopic" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."Label" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Staff can manage manual questions" ON public."ManualQuestion" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."MeetingAttendance" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."MessageTemplate" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."OnboardingEvent" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."Participant" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ParticipantCheckIn" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ParticipantFlag" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ParticipantHandover" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ParticipantNote" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ParticipantOnboardingStatus" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ParticipantStageChange" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ParticipantWrapUp" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."PendingChange" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Staff can read planner changes" ON public."PlannerChange" USING (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ProfileField" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."ProfileFieldAnswer" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Staff can read public holidays" ON public."PublicHoliday" USING (app_is_staff());
ALTER POLICY "Allow all operations" ON public."PushReminderLog" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."PushSubscription" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."RecapRelease" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."RejectedChange" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Resource: delete" ON public."Resource" USING (app_is_admin());
ALTER POLICY "Resource: insert" ON public."Resource" WITH CHECK (app_is_admin());
ALTER POLICY "Resource: read" ON public."Resource" USING ((app_is_staff() AND resource_visible_to_staff("cohortId", "visibleToSupports", "hubIds")));
ALTER POLICY resource_open ON public."Resource" USING (app_is_admin()) WITH CHECK (app_is_admin());
ALTER POLICY "Allow all operations" ON public."Scripture" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."SheetRegistration" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."SupportActivityCompletion" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."SupportChecklistItem" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Staff can manage class feedback" ON public."SupportClassFeedback" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Admins manage hubs" ON public."SupportHub" USING (app_is_admin()) WITH CHECK (app_is_admin());
ALTER POLICY "Staff can read hubs" ON public."SupportHub" USING (app_is_staff());
ALTER POLICY "Admin or hub lead can manage support notes" ON public."SupportNote" USING ((app_is_admin() OR (("hubId" IS NOT NULL) AND ("supportId" <> app_current_user_id()) AND (EXISTS ( SELECT 1
   FROM ("SupportHub" h
     JOIN "HubMembership" m ON (((m."hubId" = h.id) AND (m."userId" = "SupportNote"."supportId"))))
  WHERE ((h.id = "SupportNote"."hubId") AND (h."leadUserId" = app_current_user_id()))))))) WITH CHECK ((app_is_admin() OR (("hubId" IS NOT NULL) AND ("supportId" <> app_current_user_id()) AND (EXISTS ( SELECT 1
   FROM ("SupportHub" h
     JOIN "HubMembership" m ON (((m."hubId" = h.id) AND (m."userId" = "SupportNote"."supportId"))))
  WHERE ((h.id = "SupportNote"."hubId") AND (h."leadUserId" = app_current_user_id())))))));
ALTER POLICY "Admins manage training sessions" ON public."SupportSession" USING ((app_is_admin() AND (type <> 'SUNDAY_RECAP'::text))) WITH CHECK ((app_is_admin() AND (type <> 'SUNDAY_RECAP'::text)));
ALTER POLICY "Staff can read support sessions" ON public."SupportSession" USING (app_is_staff());
ALTER POLICY "Staff can read support session attendance" ON public."SupportSessionAttendance" USING (app_is_staff());
ALTER POLICY "Staff can read support tags" ON public."SupportTag" USING (app_is_staff());
ALTER POLICY "Staff can read support tag members" ON public."SupportTagMember" USING (app_is_staff());
ALTER POLICY "Allow all operations" ON public."Team" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Staff can manage testimonies" ON public."Testimony" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."User" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."UserCohort" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."UserLabel" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."UserNotificationSetting" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public."Week" USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public.notification_settings USING (app_is_staff()) WITH CHECK (app_is_staff());
ALTER POLICY "Allow all operations" ON public.push_subscriptions USING (app_is_staff()) WITH CHECK (app_is_staff());
