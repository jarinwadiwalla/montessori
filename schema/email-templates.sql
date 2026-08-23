-- Overrides for the system emails (sign-in links, welcomes). A row here
-- replaces the coded default for that key; deleting the row restores it.
-- Edited from Guru → Newsletter → System emails.
CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
