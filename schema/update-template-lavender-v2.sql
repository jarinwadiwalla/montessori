-- Update lavender template: add Instagram + Support Our Work
-- Run with: wrangler d1 execute montessori-db --file=schema/update-template-lavender-v2.sql --remote

INSERT OR REPLACE INTO newsletter_templates (id, name, subject, body, updatedAt) VALUES (
  'lavender-newsletter',
  'Lavender — Full Newsletter',
  'From Montessori for Adolescents',
  '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0fa;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0fa;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <!-- Banner with logo overlaid -->
      <tr>
        <td background="https://montessoriforadolescents.com/images/banner-lavender.png"
            style="background-image:url(https://montessoriforadolescents.com/images/banner-lavender.png);background-size:cover;background-position:center;border-radius:12px 12px 0 0;padding:48px;text-align:center;line-height:0;">
          <img src="https://montessoriforadolescents.com/images/3.png" alt="Montessori for Adolescents" width="200" style="display:block;margin:0 auto;">
        </td>
      </tr>

      <!-- Greeting -->
      <tr><td style="background:#ffffff;padding:48px 48px 32px;border-left:1px solid #ddd0f0;border-right:1px solid #ddd0f0;">
        <h1 style="margin:0 0 20px;color:#3f265b;font-family:Georgia,serif;font-size:26px;font-weight:normal;line-height:1.4;">Hello, {{firstName}}.</h1>
        <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.8;">Write your opening here. This is your chance to set the tone — keep it warm, personal, and brief.</p>
        <p style="margin:0;color:#4A3F35;font-size:16px;line-height:1.8;">Continue your message here. Share what is on your mind or what you want your readers to take away.</p>
      </td></tr>

      <!-- Lavender divider section -->
      <tr><td style="background:#e4d2f8;padding:32px 48px;border-left:1px solid #ddd0f0;border-right:1px solid #ddd0f0;">
        <h2 style="margin:0 0 14px;color:#3f265b;font-family:Georgia,serif;font-size:20px;font-weight:normal;">Section Heading</h2>
        <p style="margin:0;color:#4a3060;font-size:15px;line-height:1.8;">Use this lavender section for a highlighted piece of content — a key idea, a quote, or a featured update. It draws the eye and breaks up the layout naturally.</p>
      </td></tr>

      <!-- Second body section -->
      <tr><td style="background:#ffffff;padding:32px 48px;border-left:1px solid #ddd0f0;border-right:1px solid #ddd0f0;">
        <h2 style="margin:0 0 16px;color:#3f265b;font-family:Georgia,serif;font-size:20px;font-weight:normal;">Another Section</h2>
        <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.8;">Add another section of content here. This could be a resource, a reflection, an event, or anything else worth sharing.</p>

        <!-- CTA button -->
        <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
          <tr><td style="background:#B8755D;border-radius:8px;">
            <a href="https://montessoriforadolescents.com/" style="display:block;padding:13px 28px;color:#FAF7F2;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">Learn More</a>
          </td></tr>
        </table>
      </td></tr>

      <!-- Sign off + Support Our Work -->
      <tr><td style="background:#ffffff;padding:8px 48px 40px;border-left:1px solid #ddd0f0;border-right:1px solid #ddd0f0;">
        <hr style="border:none;border-top:1px solid #e8e0f0;margin:0 0 28px;">
        <p style="margin:0 0 28px;color:#7D6B5D;font-size:15px;line-height:1.8;">Warmly,<br><strong style="color:#3f265b;">The Montessori for Adolescents Team</strong></p>

        <!-- Support Our Work button -->
        <table cellpadding="0" cellspacing="0">
          <tr><td style="background:#e4d2f8;border-radius:8px;">
            <a href="https://montessoriforadolescents.com/access/" style="display:block;padding:12px 24px;color:#3f265b;font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;">&#9829;&#160; Support Our Work</a>
          </td></tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#e4d2f8;border-radius:0 0 12px 12px;border:1px solid #ddd0f0;border-top:none;padding:24px 48px;text-align:center;">

        <!-- Instagram link -->
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
          <tr>
            <td style="background:#3f265b;border-radius:10px;padding:8px 16px;">
              <a href="https://www.instagram.com/montessoriforadolescents" target="_blank" style="text-decoration:none;color:#e4d2f8;font-family:Arial,sans-serif;font-size:13px;font-weight:700;display:inline-block;vertical-align:middle;">
                <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI1IiBzdHJva2U9IiNlNGQyZjgiIHN0cm9rZS13aWR0aD0iMS41Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iNSIgc3Ryb2tlPSIjZTRkMmY4IiBzdHJva2Utd2lkdGg9IjEuNSIvPjxjaXJjbGUgY3g9IjE3LjUiIGN5PSI2LjUiIHI9IjEiIGZpbGw9IiNlNGQyZjgiLz48L3N2Zz4="
                  alt="" width="16" height="16" style="display:inline-block;vertical-align:middle;margin-right:6px;">
                Follow us on Instagram
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;color:#5a3d7a;line-height:1.6;">Montessori for Adolescents &nbsp;·&nbsp; montessoriforadolescents.com</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#7a5a9a;">
          <a href="{{unsubscribeUrl}}" style="color:#7a5a9a;">Unsubscribe</a> &nbsp;·&nbsp;
          <a href="{{preferencesUrl}}" style="color:#7a5a9a;">Email Preferences</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>',
  datetime('now')
);
