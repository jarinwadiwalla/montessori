// File types accepted into the shared document folders.
//
// Deliberately separate from api/community/upload.js, which handles post
// attachments and accepts only images and PDFs. The document library takes
// office files too, and the two shouldn't drift into each other's rules.

export const MAX_DOCUMENT = 25 * 1024 * 1024; // 25 MB

// kind drives the UI: 'pdf' and 'image' can be previewed in a browser
// window, the rest can only be downloaded.
export const PREVIEWABLE = new Set(["pdf", "image"]);

const TYPES = {
  "application/pdf": { kind: "pdf", ext: "pdf" },

  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/gif": { kind: "image", ext: "gif" },
  "image/webp": { kind: "image", ext: "webp" },

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    { kind: "doc", ext: "docx" },
  "application/msword": { kind: "doc", ext: "doc" },

  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    { kind: "slides", ext: "pptx" },
  "application/vnd.ms-powerpoint": { kind: "slides", ext: "ppt" },

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    { kind: "sheet", ext: "xlsx" },
  "application/vnd.ms-excel": { kind: "sheet", ext: "xls" },
};

export function typeFor(contentType) {
  return TYPES[contentType] || null;
}

export const ACCEPT_ATTRIBUTE =
  ".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.doc,.pptx,.ppt,.xlsx,.xls";

/**
 * Magic-byte check, so a file has to look like what its content type says.
 *
 * Returns one of: 'pdf' | 'image' | 'zip' | 'ole2' | 'unknown'.
 *
 * Modern office formats (docx/pptx/xlsx) are ZIP containers and legacy
 * ones are OLE2, so this can confirm the family but not the specific
 * application — a plain .zip renamed .docx would pass. That is accepted:
 * these files are served only to signed-in members, with `nosniff` and a
 * sandbox CSP, so a mislabelled archive is inert rather than dangerous.
 */
export function sniffFamily(b) {
  if (b.length < 8) return "unknown";

  // %PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image";
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image";
  // GIF8
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image";
  // RIFF....WEBP
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image";
  }
  // PK.. — ZIP container: docx, pptx, xlsx
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) {
    return "zip";
  }
  // OLE2 compound file: legacy doc, ppt, xls
  if (
    b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 &&
    b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1
  ) {
    return "ole2";
  }
  return "unknown";
}

/** Does the sniffed family match what this kind should look like? */
export function familyMatches(kind, family, ext) {
  if (kind === "pdf") return family === "pdf";
  if (kind === "image") return family === "image";
  // Office: modern formats are zip, legacy are ole2.
  const legacy = ["doc", "ppt", "xls"].includes(ext);
  return legacy ? family === "ole2" : family === "zip";
}

export function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._ -]/g, "").slice(0, 120);
}
