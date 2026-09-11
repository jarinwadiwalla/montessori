/**
 * Partnership rate card.
 *
 * Mirrors /partnership/ on the site, with the prices the page does not
 * publish. Sent by hand to people who enquire.
 *
 *   node scripts/generate-partnership-pdf.cjs
 *
 * Everything that changes lives in PRICES and the content arrays below.
 */
const fs = require("fs");
const path = require("path");
const PdfPrinter = require("pdfmake/js/Printer").default;

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Prices
//
// This repository is public and public/downloads/ is served on the live
// site, so the real figures live in scripts/partnership-prices.json, which
// is gitignored. Without it the example placeholders are used, which makes
// it obvious the numbers are missing rather than shipping wrong ones.
// ---------------------------------------------------------------------------
const priceFile = path.join(__dirname, "partnership-prices.json");
const examplePriceFile = path.join(__dirname, "partnership-prices.example.json");
const usingReal = fs.existsSync(priceFile);
const PRICES = JSON.parse(fs.readFileSync(usingReal ? priceFile : examplePriceFile, "utf8"));
if (!usingReal) {
  console.warn("No partnership-prices.json found — using example placeholders.");
}

// ---------------------------------------------------------------------------
// Palette — the site's, not the old purple and gold
// ---------------------------------------------------------------------------
const TERRACOTTA = "#D0905B";
const TERRACOTTA_DARK = "#B87440";
const CHOCOLATE = "#3E312A";
const EARTH = "#5C4A3A";
const CREAM = "#EEE4DB";
const CREAM_SOFT = "#FAF7F2";
const BORDER = "#E5DFD7";

const fonts = {
  Lora: {
    normal: path.join(__dirname, "fonts", "Lora-Regular.ttf"),
    bold: path.join(__dirname, "fonts", "Lora-Regular.ttf"),
    italics: path.join(__dirname, "fonts", "Lora-Italic.ttf"),
    bolditalics: path.join(__dirname, "fonts", "Lora-Italic.ttf"),
  },
  Inter: {
    normal: path.join(__dirname, "fonts", "Inter-Regular.ttf"),
    bold: path.join(__dirname, "fonts", "Inter-Regular.ttf"),
    italics: path.join(__dirname, "fonts", "Inter-Regular.ttf"),
    bolditalics: path.join(__dirname, "fonts", "Inter-Regular.ttf"),
  },
};

const logoDataUri =
  "data:image/png;base64," +
  fs.readFileSync(path.join(ROOT, "public/images/logo-terracotta.png")).toString("base64");

// ---------------------------------------------------------------------------
// Content, kept in step with /partnership/
// ---------------------------------------------------------------------------
const MONTHLY_INCLUDES = [
  "Custom side-by-side partnership to help you navigate starting or optimizing your adolescent program, based on your needs right now",
  "Strategy where you need it most; chosen areas of focus for each week",
  "Two 60-minute guidance calls, or four 30-minute calls",
  "Written call notes and action items after each session",
  "Custom monthly checklist and planning document",
  "Email support between calls",
  "Membership to the Montessori Adolescent Collective, including access to the online resource library",
  "Cancel any time, for any reason",
];

const ADD_ONS = [
  ["Planning and Preparation", [
    ["philosophy", "Grounding the team in Montessori adolescent philosophy"],
    ["environment", "Designing the prepared environment"],
    ["adultPrep", "Preparing the adults who will hold the environment"],
    ["team", "Building and supporting your team"],
  ]],
  ["Environment Structure", [
    ["studyWorkTerm", "Planning and running a study and work term"],
    ["scheduleFlows", "Shaping the daily and weekly flow"],
    ["curriculumMap", "Curriculum planning, mapped to your students"],
    ["mathematics", "Building the mathematics sequence"],
    ["dailyLife", "Establishing daily life: meal rituals, responsibilities and community management"],
  ]],
  ["Administrative", [
    ["marketing", "Marketing your program"],
    ["enrollment", "Enrolling your first students"],
    ["specialists", "Recruiting visiting specialists"],
    ["parentEd", "Bringing parents with you"],
    ["events", "Running events and raising funds"],
    ["accreditation", "Navigating accreditation and GED options"],
  ]],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rule = (width = 46, color = TERRACOTTA, margin = [0, 10, 0, 18]) => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 1, lineColor: color }],
  margin,
});

const tick = (text) => ({
  columns: [
    { text: "✓", color: TERRACOTTA_DARK, width: 14, fontSize: 10, margin: [0, 1, 0, 0] },
    { text, style: "body", width: "*" },
  ],
  margin: [0, 0, 0, 5],
});

// Same row, with the price set hard right so the column reads as a column.
const pricedTick = (text, price) => ({
  columns: [
    { text: "✓", color: TERRACOTTA_DARK, width: 14, fontSize: 10, margin: [0, 1, 0, 0] },
    { text, style: "body", width: "*" },
    {
      text: price || "",
      style: "body",
      color: CHOCOLATE,
      width: 52,
      alignment: "right",
    },
  ],
  margin: [0, 0, 0, 7],
});

const card = (body, fill = "#FFFFFF") => ({
  unbreakable: true,
  table: { widths: ["*"], body: [[{ stack: body, margin: [18, 16, 18, 16] }]] },
  layout: {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => TERRACOTTA,
    vLineColor: () => TERRACOTTA,
    fillColor: () => fill,
    paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
  },
  margin: [0, 0, 0, 18],
});

// ---------------------------------------------------------------------------
const docDefinition = {
  pageSize: "A4",
  pageMargins: [56, 56, 56, 64],
  defaultStyle: { font: "Inter", fontSize: 10, color: EARTH, lineHeight: 1.35 },
  background: () => ({ canvas: [{ type: "rect", x: 0, y: 0, w: 595.28, h: 841.89, color: CREAM_SOFT }] }),
  styles: {
    h1: { font: "Lora", fontSize: 30, color: CHOCOLATE },
    h2: { font: "Lora", fontSize: 19, color: CHOCOLATE },
    h3: { font: "Lora", fontSize: 13, color: CHOCOLATE },
    eyebrow: { font: "Inter", fontSize: 8, characterSpacing: 1.6, color: EARTH },
    body: { fontSize: 10, color: EARTH },
    price: { font: "Lora", fontSize: 24, color: CHOCOLATE },
    small: { fontSize: 8.5, color: EARTH },
  },
  footer: (page) => ({
    columns: [
      { text: "Montessori for Adolescents", style: "small", margin: [56, 0, 0, 0] },
      { text: String(page), style: "small", alignment: "right", margin: [0, 0, 56, 0] },
    ],
    margin: [0, 18, 0, 0],
  }),
  content: [
    // ---- cover ----
    { image: logoDataUri, width: 62, alignment: "center", margin: [0, 40, 0, 20] },
    { text: "PARTNERSHIP", style: "eyebrow", alignment: "center" },
    { text: "Guidance and Rates", style: "h1", alignment: "center", margin: [0, 8, 0, 0] },
    { ...rule(60, TERRACOTTA, [0, 14, 0, 26]), alignment: "center" },
    {
      text: "Erdkinder, German for children of the earth, was Maria Montessori's vision for adolescent education. She believed young people needed more than a classroom: real work, real community, and a real connection to the land.",
      style: "body", alignment: "center", italics: true, margin: [40, 0, 40, 12],
    },
    {
      text: "Our consulting supports communities ready to bring that vision to life. Every consultant holds the AMI 12–18 Adolescent Diploma and has built programs from the ground up.",
      style: "body", alignment: "center", margin: [40, 0, 40, 30],
    },

    // ---- monthly ----
    card([
      { text: "Monthly Partnership", style: "h2", alignment: "center" },
      { ...rule(46, TERRACOTTA, [0, 8, 0, 14]), alignment: "center" },
      { text: PRICES.monthly, style: "price", alignment: "center" },
      { text: "per month", style: "small", alignment: "center", margin: [0, 2, 0, 4] },
      { text: "Cancel any time. No contract.", style: "body", alignment: "center", margin: [0, 0, 0, 16] },
      { text: "EVERY MONTH INCLUDES", style: "eyebrow", alignment: "center", margin: [0, 0, 0, 12] },
      ...MONTHLY_INCLUDES.map(tick),
    ]),


    // ---- add-ons ----
    // Heading, rule and intro travel together, or the heading is left
    // stranded at the foot of a page with its text on the next.
    {
      unbreakable: true,
      stack: [
        { text: "Areas of Focus", style: "h2", alignment: "center", margin: [0, 26, 0, 0] },
        { ...rule(46, TERRACOTTA, [0, 10, 0, 12]), alignment: "center" },
        {
          text: "Available to anyone, in a Monthly Partnership or not.",
          style: "body", alignment: "center", margin: [30, 0, 30, 6],
        },
      ],
    },
    ...ADD_ONS.map(([title, items]) =>
      card([
        { text: title, style: "h3", margin: [0, 0, 0, 4] },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 420, y2: 0, lineWidth: 0.5, lineColor: BORDER }], margin: [0, 0, 0, 10] },
        ...items.map(([key, text]) => pricedTick(text, key ? PRICES.addOns[key] : "")),
      ])
    ),

    // ---- contact ----
    {
      table: { widths: ["*"], body: [[{ stack: [
        { text: "READY TO BEGIN?", style: "eyebrow", color: CREAM, alignment: "center" },
        { text: "Every Erdkinder starts with a seed.", style: "h2", color: CREAM, alignment: "center", margin: [0, 8, 0, 10] },
        { text: "Tell us where you are and what your vision is. We can't wait to bring it to life, together.", style: "body", color: CREAM, alignment: "center", margin: [40, 0, 40, 14] },
        { text: "montessoriforadolescents@gmail.com", style: "body", color: CREAM, alignment: "center" },
        { text: "montessoriforadolescents.com", style: "body", color: CREAM, alignment: "center" },
      ], margin: [20, 24, 20, 24] }]] },
      layout: {
        hLineWidth: () => 0, vLineWidth: () => 0,
        fillColor: () => CHOCOLATE,
        paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
      },
      margin: [0, 14, 0, 0],
      unbreakable: true,
    },
  ],
};

async function generate() {
  const printer = new PdfPrinter(fonts);
  // This build of pdfmake returns a promise here, not the document.
  const pdfDoc = await printer.createPdfKitDocument(docDefinition);

  const outDir = path.join(ROOT, "public", "downloads");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "partnership-rates.pdf");
  const stream = fs.createWriteStream(outPath);

  pdfDoc.pipe(stream);
  pdfDoc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => { console.log("PDF written:", outPath); resolve(); });
    stream.on("error", reject);
  });
}

generate().catch((err) => { console.error(err); process.exit(1); });
