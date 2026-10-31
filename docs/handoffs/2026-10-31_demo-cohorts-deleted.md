# Demo cohorts deleted; the Cohort 10 repair record kept here

Date: 2026-10-31. Done at the owner's request. Both deletions are in the encrypted backup of 30 Oct.

## What was deleted
- **"ZZ Demo Cohort"** (`7bfc26d9-1487-410c-a495-44b163e30b03`, classes from 30 Aug 2026), with everything tied to it:
  - 10 weeks, 4 participants, 3 groups, 2 hubs;
  - 13 escalation notices, 6 feedback answers, 3 testimonies, 1 announcement;
  - a few support sessions, labels and class-feedback rows.
  - Cohort 10 was unchanged (87 participants, 28 groups before and after).
  - Gotcha: deleting a cohort with groups fails on its own, because removing a group membership writes a
    `ParticipantHandover` row that points at the group being deleted. Delete the cohort's `GroupParticipant` rows
    first, then the cohort.
- **"ZZ Resources QA"** (`7e71825e-4bab-4f49-8e5c-ff74ead9643a`, archived, empty). Its one audit record in
  `Cohort10FollowUpRepairLedger` was deleted too (the owner chose to copy it here first).

## The repair record (copied before deleting)
From migration `20261004170000_current_cohort_followup_repair.sql`. On 2026-10-04, follow-up contacts
and participants created in the QA cohort by mistake were moved into Cohort 10.
- **Repair key:** `cohort10_followup_qa_20261004`
- **Source cohort:** ZZ Resources QA, `7e71825e-4bab-4f49-8e5c-ff74ead9643a`
- **Target cohort:** Cohort 10, `feaac060-bd12-44fc-b681-9109d3b070fe`
- **Follow-up contacts moved (29):**
  - `00ea4b92-b002-4739-bda9-d34e929bbeae`
  - `0a34a5bb-4fb6-4f4d-b891-90e0dd4f6fbb`
  - `15004f6c-3d30-41ec-9d82-6ace6c3d9d95`
  - `1f682534-1db0-4930-891a-51ede1e2fbf7`
  - `27d2246f-5eea-4dd0-98a8-7f08bc95604e`
  - `2a7280cc-e4f1-4c59-8b96-d44e470ca738`
  - `2aeef0ba-ecb5-49f8-9ab5-6e205a09e376`
  - `2c5c9cd1-8ec5-47a0-90c2-4d236637f3f8`
  - `3deecffb-dc24-46be-9bb1-993723835d69`
  - `46c8b0dc-4d8c-4fd5-acb3-d8b8c282e367`
  - `594d5abc-9f8b-4dfe-b3bd-c97c6ffaada8`
  - `63fb2222-2a84-4e39-8d59-aa69469ebcee`
  - `6a7eeb82-6bac-4d65-ae6e-4ae4e6713e30`
  - `752734f7-816f-4557-bb5b-be63bf4e512d`
  - `7bd1796c-a760-4e57-b9b3-f26fa7561270`
  - `7e123827-5ea0-49a2-90a4-df22549660e1`
  - `8455501b-a270-4d54-93b6-5a1e708d3b4a`
  - `902e3c9b-dcf4-49aa-a583-b6376b52faa8`
  - `a6ae7f40-5f64-4b67-bcaa-e10ed3f4b3d1`
  - `ad1557cc-7693-4a3b-ab72-8450f4f55002`
  - `b617c787-86e9-4e2c-af5c-a98559681f9c`
  - `bd0ba963-1d71-4ab8-8dbb-8d1de8fa117d`
  - `c9bac8f0-9278-4d56-bb21-c7e40e00ed1c`
  - `d57f0c5c-4898-4a4a-9743-e803f6538693`
  - `d84fa615-6486-43de-b771-12a1a9e1b59f`
  - `dfeaa7e8-d34c-4f7c-b3e4-673c8c6a7097`
  - `e2831fe9-c816-42d4-9a50-8b6c56016151`
  - `eb35c599-a11b-42e7-9b74-a83254419241`
  - `ef597314-561a-4786-8344-1c16b31a3f68`
- **Participants moved (29):**
  - `02ec4ecd-e39f-43d5-87f6-fe5705a8eb4a`
  - `067aab43-a8dd-4181-a66b-0be278d7be85`
  - `0a4a9725-9485-4de2-b987-398bbfd9a6b5`
  - `0ee8e581-75b4-4487-b109-5b0ccbaea206`
  - `1a1fd83e-8724-4e7a-bb6f-4f4da8c4acfe`
  - `2e1af08c-846e-4bea-8392-29f783269f70`
  - `2f4a0153-c282-47e2-9dfd-ec5e5612990d`
  - `322f01fd-82d5-4602-aa43-c5d65f73f4ec`
  - `3da3b6ad-3ea6-4a23-898b-f31a5284f398`
  - `40af91f8-616f-4c7b-b5ed-7915a60c82dc`
  - `4881d722-30a7-41bc-8642-41e730192cf3`
  - `4e179ffd-3a6d-403d-970e-17ecbd884ea1`
  - `577e9331-13a3-4c63-a885-4346ceb8ea99`
  - `76462b7d-570b-4f4d-b0d9-9eba28fabb76`
  - `7c4327bb-6ecf-4ce8-a380-924dbe69be71`
  - `80c19324-5ca4-4f91-bc63-ccf4ba5f0a7e`
  - `91ea94b6-398d-4f1f-a518-70a3754726d5`
  - `9afd7ca0-b173-4c43-89d1-6894ff99bbd0`
  - `9c76fbe8-0481-4200-808f-5fa15c27ad05`
  - `9e107771-ff33-41ea-ae81-a86d40f475e2`
  - `a3c27bd0-b6aa-4f5c-b001-f8fddc99c451`
  - `a5c60e2e-b40e-4ece-9e8f-232ebe0f3a03`
  - `abce410f-473a-48c1-960e-7c45db4ddb56`
  - `c0f8d9ca-967b-4c3c-be80-44508ba3a89d`
  - `cc67ca3f-faba-4930-bd6d-ea6c5cd1718f`
  - `cf26317f-673d-4533-ba54-38efb7d80154`
  - `e014636f-400e-4fc4-b158-e6c8634eeeb7`
  - `f409bff8-d463-44f5-804f-a678b7080d0b`
  - `f6da50f8-728a-4c55-a438-b08ea42c839b`
- **Participant accounts carried over (4):**
  - `2f4a0153-c282-47e2-9dfd-ec5e5612990d`
  - `76462b7d-570b-4f4d-b0d9-9eba28fabb76`
  - `9e107771-ff33-41ea-ae81-a86d40f475e2`
  - `c0f8d9ca-967b-4c3c-be80-44508ba3a89d`
