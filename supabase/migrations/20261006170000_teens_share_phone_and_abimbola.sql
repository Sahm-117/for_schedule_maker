-- Abimbola Oluwaseye and Ibukunoluwa Abimbola signed up a minute apart with the
-- same phone and email (siblings). The second form "corrected" the first
-- sign-up, so Abimbola Oluwaseye was overwritten: one record named Ibukunoluwa
-- Abimbola kept his gender (Male). This gives him his own participant record
-- (from his original sign-up, SheetRegistration bff99367-...) and sets
-- Ibukunoluwa's record to Female, as her own form says.
--
-- Decision (Olamide, 2026-10-06): teens may share one phone number, usually a
-- parent's. uniq_participant_phone_per_cohort therefore no longer applies to
-- participants whose age range is "18 and below". The two named exceptions
-- (FLOW_MAP rule 3) stay as they were.
--
-- Rollback: DELETE FROM "Participant" WHERE id = '5d20e106-dd3d-42cc-952e-469a57e08c6e';
-- recreate uniq_participant_phone_per_cohort without the age condition;
-- UPDATE the contact and participant gender back to 'Male'.

DROP INDEX IF EXISTS public.uniq_participant_phone_per_cohort;
CREATE UNIQUE INDEX uniq_participant_phone_per_cohort ON public."Participant"
  USING btree (fof_phone_key(phone), COALESCE("cohortId", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE (fof_phone_key(phone) IS NOT NULL)
    AND (id <> ALL (ARRAY[
      '0476b50f-de92-4b0a-baa9-0c8c05052b0f'::uuid,
      '80c19324-5ca4-4f91-bc63-ccf4ba5f0a7e'::uuid
    ]))
    AND (replace(lower(COALESCE("ageRange", '')), ' ', '') <> '18andbelow');

INSERT INTO "Participant" (id, "fullName", phone, "cohortId", source, status, email, gender, "ageRange", occupation, "registrationDate")
SELECT '5d20e106-dd3d-42cc-952e-469a57e08c6e'::uuid, 'Abimbola Oluwaseye', '07037364247', 'feaac060-bd12-44fc-b681-9109d3b070fe'::uuid, 'FORM', 'ACTIVE',
       'toyin.abimbola10@gmail.com', 'Male', '18 and below', 'Student', r."signedUpAt"
FROM "SheetRegistration" r
WHERE r.id = 'bff99367-11c3-45ae-aa60-f06357537551'
ON CONFLICT (id) DO NOTHING;

UPDATE "Participant" SET gender = 'Female', "updatedAt" = NOW()
WHERE id = 'abce410f-473a-48c1-960e-7c45db4ddb56' AND "fullName" = 'Ibukunoluwa Abimbola';
UPDATE "FollowUpContact" SET gender = 'Female', "updatedAt" = NOW()
WHERE id = '6a7eeb82-6bac-4d65-ae6e-4ae4e6713e30' AND "fullName" = 'Ibukunoluwa Abimbola';
