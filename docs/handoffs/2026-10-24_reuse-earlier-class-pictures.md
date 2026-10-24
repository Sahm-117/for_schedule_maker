# Reuse an earlier class picture (graphic and teacher photos)

Date: 2026-10-24. Frontend only: no migration, no function. FLOW_MAP rule 105.

## Summary
In the admin week editor (Cohorts > Edit weeks > a week > Class card), the class graphic and the adult and teen teacher photos each have **Use an earlier one** beside Add / Replace. It opens a small panel of the pictures earlier classes already use (any cohort but Practice, newest first, one per picture, with the teacher's name and "Cohort · Wk"). Only pictures of that kind are shown: graphics for the graphic, teacher photos for both teacher slots. Choosing one uploads nothing; it joins the week when the editor is saved. Recap, teen recap and manual documents already had this.

## Why it matters (safety)
Two classes can now point at the same stored file. `removeClassImage` used to delete a replaced picture; it now first checks no `Week` row still uses the URL in `classGraphicUrl`, `teacherPhotoUrl` or `teenTeacherPhotoUrl`, and keeps the file when it cannot check.

## Scope decision
The request was "choose an existing file, relevant to the module the user is on", for any upload. Done here for the module the admin was on (the week editor). Other uploads were looked at and left alone: profile photos are personal; landing images, scripture posts and templates keep no history of earlier files to offer; resources are the library itself; survey and CSV uploads are one-offs. Each of those would need its own source of "earlier" files if wanted.

## How it was tested
Browser (local app, mocked backend), as an admin: opened a week, "Use an earlier one" on the graphic (showed the earlier graphic) and on the teacher photo (showed the earlier teacher by name), chose a graphic and it appeared in the editor, no console errors. `npm run build`, eslint on the changed files, type check (7 known errors only). Not tested with real data, or saving a week that reuses a picture and then replacing it on another week (the delete guard was reasoned and type-checked only).
