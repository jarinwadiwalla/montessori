-- Seed newsletter templates
-- Run with: wrangler d1 execute montessori-db --file=schema/seed-templates.sql --remote

INSERT OR REPLACE INTO newsletter_templates (id, name, subject, body, updatedAt) VALUES (
  'welcome',
  'Welcome Email (New Subscriber)',
  'Welcome to Montessori for Adolescents',
  '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <!-- Header -->
      <tr><td style="background:#3f265b;border-radius:12px 12px 0 0;padding:40px 48px;text-align:center;">
        <img src="https://montessoriforadolescents.com/images/3.png" alt="Montessori for Adolescents" width="200" style="filter:brightness(0) invert(1);display:block;margin:0 auto 24px;">
        <h1 style="margin:0;color:#FAF7F2;font-family:Georgia,serif;font-size:28px;font-weight:normal;line-height:1.3;">Welcome, {{firstName}}.</h1>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:48px;border-left:1px solid #E8E0D8;border-right:1px solid #E8E0D8;">
        <p style="margin:0 0 20px;color:#4A3F35;font-size:17px;line-height:1.8;">Thank you for joining us. We are glad you are here.</p>
        <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.8;">Montessori for Adolescents exists to support the people building communities where young people can do real, meaningful work — and grow through it.</p>
        <p style="margin:0 0 32px;color:#4A3F35;font-size:16px;line-height:1.8;">In your inbox, you can expect occasional reflections, practical resources, and updates from our work. We write when we have something worth saying.</p>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
          <tr><td style="background:#B8755D;border-radius:8px;">
            <a href="https://montessoriforadolescents.com/blog/" style="display:block;padding:14px 32px;color:#FAF7F2;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;">Read Our Latest Posts</a>
          </td></tr>
        </table>

        <p style="margin:0;color:#7D6B5D;font-size:15px;line-height:1.8;">Warmly,<br><strong style="color:#4A3F35;">The Montessori for Adolescents Team</strong></p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#F0EBE3;border-radius:0 0 12px 12px;border:1px solid #E8E0D8;border-top:none;padding:24px 48px;text-align:center;">
        <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;color:#9B8E82;line-height:1.6;">You are receiving this because you subscribed at montessoriforadolescents.com.</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9B8E82;">
          <a href="{{unsubscribeUrl}}" style="color:#9B8E82;">Unsubscribe</a> &nbsp;·&nbsp;
          <a href="{{preferencesUrl}}" style="color:#9B8E82;">Email Preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>',
  datetime('now')
);

INSERT OR REPLACE INTO newsletter_templates (id, name, subject, body, updatedAt) VALUES (
  'monthly-reflection',
  'Monthly Reflection',
  'A reflection from Montessori for Adolescents',
  '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <!-- Header -->
      <tr><td style="background:#3f265b;border-radius:12px 12px 0 0;padding:32px 48px;text-align:center;">
        <img src="https://montessoriforadolescents.com/images/3.png" alt="Montessori for Adolescents" width="180" style="filter:brightness(0) invert(1);display:block;margin:0 auto 16px;">
        <p style="margin:0;color:rgba(250,247,242,0.6);font-family:Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Monthly Reflection</p>
      </td></tr>

      <!-- Pull quote -->
      <tr><td style="background:#e4d2f8;padding:32px 48px;text-align:center;border-left:1px solid #d4b8f0;border-right:1px solid #d4b8f0;">
        <p style="margin:0;color:#3f265b;font-family:Georgia,serif;font-size:20px;font-style:italic;line-height:1.7;">&ldquo;Write your quote here.&rdquo;</p>
        <p style="margin:12px 0 0;color:#5a3d7a;font-family:Arial,sans-serif;font-size:13px;font-weight:600;">— Author Name</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:48px;border-left:1px solid #E8E0D8;border-right:1px solid #E8E0D8;">
        <h2 style="margin:0 0 20px;color:#3E312A;font-family:Georgia,serif;font-size:22px;font-weight:normal;">Hello {{firstName}},</h2>
        <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.8;">Write your opening paragraph here. Connect with your reader and set the tone for this reflection.</p>
        <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.8;">Continue your reflection here. Share what you have been thinking about, observing, or learning.</p>

        <!-- Divider -->
        <hr style="border:none;border-top:1px solid #E8E0D8;margin:32px 0;">

        <h3 style="margin:0 0 16px;color:#3E312A;font-family:Georgia,serif;font-size:18px;font-weight:normal;">What We Have Been Working On</h3>
        <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.8;">Share updates about your work, events, or community here.</p>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0" style="margin:32px auto 0;">
          <tr><td style="background:#B8755D;border-radius:8px;">
            <a href="https://montessoriforadolescents.com/blog/" style="display:block;padding:14px 32px;color:#FAF7F2;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;">Read More on Our Blog</a>
          </td></tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#F0EBE3;border-radius:0 0 12px 12px;border:1px solid #E8E0D8;border-top:none;padding:24px 48px;text-align:center;">
        <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;color:#9B8E82;line-height:1.6;">Montessori for Adolescents &nbsp;·&nbsp; montessoriforadolescents.com</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9B8E82;">
          <a href="{{unsubscribeUrl}}" style="color:#9B8E82;">Unsubscribe</a> &nbsp;·&nbsp;
          <a href="{{preferencesUrl}}" style="color:#9B8E82;">Email Preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>',
  datetime('now')
);

INSERT OR REPLACE INTO newsletter_templates (id, name, subject, body, updatedAt) VALUES (
  'community-update',
  'Community Update / Announcement',
  'An update from Montessori for Adolescents',
  '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <!-- Header -->
      <tr><td style="background:#3f265b;border-radius:12px 12px 0 0;padding:32px 48px;text-align:center;">
        <img src="https://montessoriforadolescents.com/images/3.png" alt="Montessori for Adolescents" width="180" style="filter:brightness(0) invert(1);display:block;margin:0 auto 16px;">
        <p style="margin:0;color:rgba(250,247,242,0.6);font-family:Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Community Update</p>
      </td></tr>

      <!-- Hero text -->
      <tr><td style="background:#5C4A3A;padding:40px 48px;text-align:center;border-left:1px solid #4a3a2e;border-right:1px solid #4a3a2e;">
        <h1 style="margin:0;color:#FAF7F2;font-family:Georgia,serif;font-size:26px;font-weight:normal;line-height:1.4;">Your Announcement Headline Goes Here</h1>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:48px;border-left:1px solid #E8E0D8;border-right:1px solid #E8E0D8;">
        <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.8;">Hello {{firstName}},</p>
        <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.8;">Write your announcement here. Be direct about what you are sharing and why it matters to your reader.</p>
        <p style="margin:0 0 32px;color:#4A3F35;font-size:16px;line-height:1.8;">Add any additional context, details, or next steps here.</p>

        <!-- Highlighted box -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr><td style="background:#F0EBE3;border-left:4px solid #B8755D;border-radius:0 8px 8px 0;padding:20px 24px;">
            <p style="margin:0;color:#4A3F35;font-size:15px;line-height:1.7;font-style:italic;">Key detail or important note goes in this highlighted box.</p>
          </td></tr>
        </table>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr><td style="background:#B8755D;border-radius:8px;">
            <a href="https://montessoriforadolescents.com/" style="display:block;padding:14px 32px;color:#FAF7F2;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;">Learn More</a>
          </td></tr>
        </table>

        <p style="margin:32px 0 0;color:#7D6B5D;font-size:15px;line-height:1.8;">Warmly,<br><strong style="color:#4A3F35;">The Montessori for Adolescents Team</strong></p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#F0EBE3;border-radius:0 0 12px 12px;border:1px solid #E8E0D8;border-top:none;padding:24px 48px;text-align:center;">
        <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;color:#9B8E82;line-height:1.6;">Montessori for Adolescents &nbsp;·&nbsp; montessoriforadolescents.com</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9B8E82;">
          <a href="{{unsubscribeUrl}}" style="color:#9B8E82;">Unsubscribe</a> &nbsp;·&nbsp;
          <a href="{{preferencesUrl}}" style="color:#9B8E82;">Email Preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>',
  datetime('now')
);

INSERT OR REPLACE INTO newsletter_templates (id, name, subject, body, updatedAt) VALUES (
  'resource-spotlight',
  'Resource Spotlight',
  'Something worth reading — from Montessori for Adolescents',
  '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <!-- Header -->
      <tr><td style="background:#3f265b;border-radius:12px 12px 0 0;padding:32px 48px;text-align:center;">
        <img src="https://montessoriforadolescents.com/images/3.png" alt="Montessori for Adolescents" width="180" style="filter:brightness(0) invert(1);display:block;margin:0 auto 16px;">
        <p style="margin:0;color:rgba(250,247,242,0.6);font-family:Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Resource Spotlight</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:48px;border-left:1px solid #E8E0D8;border-right:1px solid #E8E0D8;">
        <p style="margin:0 0 24px;color:#4A3F35;font-size:16px;line-height:1.8;">Hello {{firstName}},</p>
        <p style="margin:0 0 32px;color:#4A3F35;font-size:16px;line-height:1.8;">We came across something we think is worth your time. Here is a short note on why.</p>

        <!-- Resource card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border:1px solid #E8E0D8;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#e4d2f8;padding:24px 28px;">
            <p style="margin:0 0 6px;color:#5a3d7a;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Featured Resource</p>
            <h2 style="margin:0 0 12px;color:#3f265b;font-family:Georgia,serif;font-size:20px;font-weight:normal;line-height:1.4;">Resource Title Goes Here</h2>
            <p style="margin:0;color:#5C4A3A;font-size:14px;line-height:1.7;">A short description of what this resource is and why you chose it. Keep it to two or three sentences.</p>
          </td></tr>
          <tr><td style="padding:20px 28px;">
            <a href="https://montessoriforadolescents.com/resources/" style="color:#B8755D;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">View Resource &rarr;</a>
          </td></tr>
        </table>

        <!-- Second resource (optional) -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border:1px solid #E8E0D8;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#F0EBE3;padding:24px 28px;">
            <p style="margin:0 0 6px;color:#9A5F4A;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Also Worth Reading</p>
            <h2 style="margin:0 0 12px;color:#3E312A;font-family:Georgia,serif;font-size:20px;font-weight:normal;line-height:1.4;">Second Resource Title</h2>
            <p style="margin:0;color:#5C4A3A;font-size:14px;line-height:1.7;">Brief description of this second resource.</p>
          </td></tr>
          <tr><td style="padding:20px 28px;">
            <a href="https://montessoriforadolescents.com/resources/" style="color:#B8755D;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">View Resource &rarr;</a>
          </td></tr>
        </table>

        <p style="margin:0;color:#7D6B5D;font-size:15px;line-height:1.8;">Until next time,<br><strong style="color:#4A3F35;">The Montessori for Adolescents Team</strong></p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#F0EBE3;border-radius:0 0 12px 12px;border:1px solid #E8E0D8;border-top:none;padding:24px 48px;text-align:center;">
        <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;color:#9B8E82;line-height:1.6;">Montessori for Adolescents &nbsp;·&nbsp; montessoriforadolescents.com</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9B8E82;">
          <a href="{{unsubscribeUrl}}" style="color:#9B8E82;">Unsubscribe</a> &nbsp;·&nbsp;
          <a href="{{preferencesUrl}}" style="color:#9B8E82;">Email Preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>',
  datetime('now')
);
