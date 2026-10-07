# Resource preview cards

Redesigned the support grid cards with image thumbnails and distinct illustrations for PDFs, documents and links. The admin list now uses the same file artwork and opens PDFs/images in the existing in-app viewer. The viewer now takes stored MIME/resource type, falls back to file extension, reports image/download failures, offers a visible Download action, and supports Escape and keyboard focus handling.

Validation: frontend production build succeeded; `git diff --check` is clean. The isolated browser QA accounts were removed. A complete authenticated Playwright pass was not run in this batch. Existing empty `catch {}` in ResourceHubModal also causes focused ESLint to report `no-empty`; that code predates this change and was left untouched.

No backend or database changes. Publication target is `Sahm-117/for_schedule_maker` main, actor Sahm-117 and author Sam <[redacted-email]>. This is a separate commit from the planner release.
