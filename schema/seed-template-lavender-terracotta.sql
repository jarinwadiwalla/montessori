-- Lavender & Terracotta newsletter template
-- Uses the current site palette from src/styles/global.css: lavender #e4d2f8,
-- purple #3f265b, terracotta #d0905b, cream #eee4db. No gold.
-- Run with: npx wrangler d1 execute montessori-db --file=schema/seed-template-lavender-terracotta.sql --remote

INSERT OR REPLACE INTO newsletter_templates (id, name, subject, body, updatedAt) VALUES (
  'lavender-terracotta-newsletter',
  'Lavender & Terracotta — Full Newsletter',
  'From Montessori for Adolescents',
  '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eee4db;font-family:Georgia,serif;">

<!-- Preview text shown in the inbox list, hidden in the email itself -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">Write one short line here — this is the preview text readers see in their inbox.</div>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#eee4db;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <!-- Header band -->
      <tr>
        <td style="background:#e4d2f8;border-radius:12px 12px 0 0;padding:44px 48px 36px;text-align:center;">
          <img src="https://montessoriforadolescents.com/images/logo-terracotta-mark.png" alt="Montessori for Adolescents" width="96" style="display:block;margin:0 auto 20px;border:0;">
          <p style="margin:0;color:#3f265b;font-family:Georgia,serif;font-size:19px;letter-spacing:0.14em;text-transform:uppercase;line-height:1.4;">Montessori</p>
          <p style="margin:4px 0 0;color:#5a3d7a;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.26em;text-transform:uppercase;">For Adolescents</p>
        </td>
      </tr>

      <!-- Terracotta hairline -->
      <tr><td style="background:#d0905b;font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>

      <!-- Greeting -->
      <tr>
        <td style="background:#ffffff;padding:44px 48px 30px;border-left:1px solid #E5DFD7;border-right:1px solid #E5DFD7;">
          <p style="margin:0 0 18px;color:#b87440;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">In this letter</p>
          <h1 style="margin:0 0 22px;color:#3f265b;font-family:Georgia,serif;font-size:30px;font-weight:normal;line-height:1.3;">Hello, {{firstName}}.</h1>
          <p style="margin:0 0 20px;color:#4A3F35;font-size:16px;line-height:1.85;">Write your opening here. This is your chance to set the tone — keep it warm, personal, and brief.</p>
          <p style="margin:0;color:#4A3F35;font-size:16px;line-height:1.85;">Continue your message here. Share what is on your mind or what you want your readers to take away.</p>
        </td>
      </tr>

      <!-- Pull quote -->
      <tr>
        <td style="background:#ffffff;padding:8px 48px 36px;border-left:1px solid #E5DFD7;border-right:1px solid #E5DFD7;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-left:3px solid #d4b8f0;padding:6px 0 6px 22px;">
                <p style="margin:0 0 10px;color:#5a3d7a;font-family:Georgia,serif;font-size:19px;font-style:italic;line-height:1.65;">Place a quote or a single key idea here — the line you most want remembered.</p>
                <p style="margin:0;color:#7D6B5D;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Maria Montessori</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Featured section -->
      <tr>
        <td style="background:#e4d2f8;padding:36px 48px;border-left:1px solid #ddd0f0;border-right:1px solid #ddd0f0;">
          <p style="margin:0 0 12px;color:#b87440;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Featured</p>
          <h2 style="margin:0 0 14px;color:#3f265b;font-family:Georgia,serif;font-size:22px;font-weight:normal;line-height:1.4;">Section Heading</h2>
          <p style="margin:0;color:#4a3060;font-size:15px;line-height:1.85;">Use this section for a highlighted piece of content — a key idea, a resource, or a featured update. It draws the eye and breaks up the layout naturally.</p>
        </td>
      </tr>

      <!-- Second body section + CTA -->
      <tr>
        <td style="background:#ffffff;padding:38px 48px 40px;border-left:1px solid #E5DFD7;border-right:1px solid #E5DFD7;">
          <h2 style="margin:0 0 16px;color:#3f265b;font-family:Georgia,serif;font-size:22px;font-weight:normal;line-height:1.4;">Another Section</h2>
          <p style="margin:0 0 26px;color:#4A3F35;font-size:16px;line-height:1.85;">Add another section of content here. This could be a resource, a reflection, an event, or anything else worth sharing.</p>

          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#d0905b;border-radius:6px;">
                <a href="https://montessoriforadolescents.com/" style="display:block;padding:14px 32px;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">Learn More</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Sign off -->
      <tr>
        <td style="background:#ffffff;padding:0 48px 40px;border-left:1px solid #E5DFD7;border-right:1px solid #E5DFD7;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="border-top:1px solid #E5DFD7;font-size:0;line-height:0;height:1px;padding:0 0 26px;">&nbsp;</td></tr>
          </table>
          <p style="margin:0;color:#7D6B5D;font-size:15px;line-height:1.8;">Warmly,<br><span style="color:#3f265b;font-family:Georgia,serif;font-size:17px;">The Montessori for Adolescents Team</span></p>
        </td>
      </tr>

      <!-- Donation block -->
      <tr>
        <td style="background:#3f265b;padding:40px 48px;text-align:center;">
          <p style="margin:0 0 12px;color:#d4b8f0;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Support Our Work</p>
          <h2 style="margin:0 0 16px;color:#e4d2f8;font-family:Georgia,serif;font-size:23px;font-weight:normal;line-height:1.4;">Help us reach more adolescents.</h2>
          <p style="margin:0 0 28px;color:#cbb8e0;font-size:15px;line-height:1.8;">Every contribution goes directly toward building environments where young people can grow into themselves.</p>

          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="background:#d0905b;border-radius:6px;">
                <a href="https://buy.stripe.com/fZuaEXcrsgkq77OcEz4sE05" style="display:block;padding:15px 40px;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">&#9829;&nbsp;&nbsp;Donate</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#e4d2f8;border-radius:0 0 12px 12px;padding:32px 48px 34px;text-align:center;">

          <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr>
              <td style="border:1px solid #b79ad4;border-radius:6px;">
                <a href="https://www.instagram.com/montessoriforadolescents" target="_blank" style="display:block;padding:10px 22px;color:#3f265b;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;text-decoration:none;">Follow us on Instagram</a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:12px;color:#5a3d7a;line-height:1.7;">Montessori for Adolescents<br>montessoriforadolescents.com</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#7a5a9a;">
            <a href="{{unsubscribeUrl}}" style="color:#7a5a9a;text-decoration:underline;">Unsubscribe</a>
            &nbsp;&#183;&nbsp;
            <a href="{{preferencesUrl}}" style="color:#7a5a9a;text-decoration:underline;">Email Preferences</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>',
  '2026-08-12T00:00:00.000Z'
);
