-- Blog drafts
CREATE TABLE IF NOT EXISTS blog_drafts (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT DEFAULT '',
  author TEXT DEFAULT 'Jarin Wadiwalla',
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  body TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  scheduledAt TEXT,
  updatedAt TEXT NOT NULL
);

-- Subscribers
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  firstName TEXT DEFAULT '',
  lastName TEXT DEFAULT '',
  subscribedAt TEXT NOT NULL,
  unsubscribed INTEGER DEFAULT 0,
  unsubscribedAt TEXT DEFAULT '',
  resubscribedAt TEXT DEFAULT '',
  preferences TEXT DEFAULT 'blog'
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  sentAt TEXT NOT NULL,
  totalSent INTEGER DEFAULT 0,
  totalRecipients INTEGER DEFAULT 0,
  status TEXT DEFAULT 'sent',
  errors TEXT DEFAULT '[]'
);

-- Blog comments
CREATE TABLE IF NOT EXISTS blog_comments (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  parent_id TEXT DEFAULT '',
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notify_replies INTEGER DEFAULT 0,
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_slug ON blog_comments(slug);
CREATE INDEX IF NOT EXISTS idx_comments_status ON blog_comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON blog_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_ip_created ON blog_comments(ip_address, createdAt);

-- Settings (notes and other admin data)
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  data TEXT DEFAULT '{}',
  updatedAt TEXT NOT NULL
);

-- Newsletter templates
CREATE TABLE IF NOT EXISTS newsletter_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  updatedAt TEXT NOT NULL
);
