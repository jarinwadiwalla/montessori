const fs = require("fs");
const path = require("path");
const PdfPrinter = require("pdfmake/js/Printer").default;

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const PURPLE = "#3f265b";
const GOLD = "#C4A94D";
const LAVENDER = "#e4d2f8";
const CREAM = "#FAF7F2";
const EARTH = "#5C4A3A";
const LIGHT_LAVENDER = "#f3ebfc";

// ---------------------------------------------------------------------------
// Fonts (TTF files in scripts/fonts/)
// ---------------------------------------------------------------------------
const fonts = {
  Lora: {
    normal: path.join(__dirname, "fonts", "Lora-Regular.ttf"),
    bold: path.join(__dirname, "fonts", "Lora-Regular.ttf"), // variable font — same file
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

// ---------------------------------------------------------------------------
// Logo — base64-encoded PNG
// ---------------------------------------------------------------------------
const logoPath = path.join(ROOT, "logo gold.png");
const logoBase64 = fs.readFileSync(logoPath).toString("base64");
const logoDataUri = `data:image/png;base64,${logoBase64}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function goldDivider() {
  return {
    canvas: [
      {
        type: "line",
        x1: 0,
        y1: 0,
        x2: 460,
        y2: 0,
        lineWidth: 1.5,
        lineColor: GOLD,
      },
    ],
    margin: [0, 12, 0, 12],
  };
}

function sectionHeader(text, opts = {}) {
  const result = {
    text,
    style: "sectionHeader",
    margin: [0, 4, 0, 8],
  };
  if (opts.pageBreak) result.pageBreak = "before";
  return result;
}

function subHeader(text) {
  return {
    text,
    style: "subHeader",
    margin: [0, 10, 0, 4],
  };
}

function bodyText(text) {
  return {
    text,
    style: "body",
    margin: [0, 0, 0, 6],
  };
}

function bulletList(items) {
  return {
    ul: items.map((item) => ({ text: item, style: "body" })),
    margin: [10, 0, 0, 8],
  };
}

function quoteBox(text, attribution) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              {
                text: `"${text}"`,
                font: "Lora",
                italics: true,
                fontSize: 11,
                color: PURPLE,
                alignment: "center",
                margin: [10, 8, 10, attribution ? 4 : 8],
              },
              ...(attribution
                ? [
                    {
                      text: `— ${attribution}`,
                      font: "Inter",
                      fontSize: 9,
                      color: GOLD,
                      alignment: "center",
                      margin: [10, 0, 10, 8],
                    },
                  ]
                : []),
            ],
            fillColor: LIGHT_LAVENDER,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i) => (i === 0 ? 3 : 0),
      vLineColor: () => GOLD,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 6, 0, 8],
  };
}

function pageFooter(currentPage, pageCount) {
  return {
    columns: [
      {
        text: "montessoriforadolescents.com",
        font: "Inter",
        fontSize: 8,
        color: GOLD,
        alignment: "left",
      },
      {
        text: `${currentPage} / ${pageCount}`,
        font: "Inter",
        fontSize: 8,
        color: EARTH,
        alignment: "right",
      },
    ],
    margin: [40, 0, 40, 0],
  };
}

// ---------------------------------------------------------------------------
// Document definition
// ---------------------------------------------------------------------------

const docDefinition = {
  pageSize: "LETTER",
  pageMargins: [50, 50, 50, 50],

  background(currentPage) {
    const items = [
      {
        canvas: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 612,
            h: 792,
            color: CREAM,
          },
        ],
      },
      {
        image: logoDataUri,
        width: 220,
        absolutePosition: { x: 196, y: 286 },
        opacity: 0.12,
      },
    ];
    if (currentPage === 1) {
      items.push({
        canvas: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 612,
            h: 50,
            color: PURPLE,
          },
          // Gold accent line at bottom of ribbon
          {
            type: "line",
            x1: 0,
            y1: 50,
            x2: 612,
            y2: 50,
            lineWidth: 2.5,
            lineColor: GOLD,
          },
        ],
      });
    }
    return items;
  },

  footer: pageFooter,

  defaultStyle: {
    font: "Inter",
    fontSize: 10,
    color: EARTH,
    lineHeight: 1.4,
  },

  styles: {
    coverTitle: {
      font: "Lora",
      fontSize: 28,
      color: PURPLE,
      alignment: "center",
      lineHeight: 1.3,
    },
    coverSubtitle: {
      font: "Inter",
      fontSize: 13,
      color: EARTH,
      alignment: "center",
      lineHeight: 1.4,
    },
    sectionHeader: {
      font: "Lora",
      fontSize: 20,
      color: PURPLE,
      lineHeight: 1.2,
    },
    subHeader: {
      font: "Lora",
      fontSize: 13,
      color: PURPLE,
      lineHeight: 1.2,
    },
    body: {
      font: "Inter",
      fontSize: 10,
      color: EARTH,
      lineHeight: 1.5,
    },
  },

  content: [
    // ===================================================================
    // PAGE 1 — COVER
    // ===================================================================
    { text: "", margin: [0, 60, 0, 0] },
    {
      image: logoDataUri,
      width: 100,
      alignment: "center",
    },
    { text: "", margin: [0, 24, 0, 0] },
    {
      text: "Montessori for\nAdolescents 101",
      style: "coverTitle",
    },
    { text: "", margin: [0, 10, 0, 0] },
    {
      text: "Overview of the characteristics, needs,\nand prepared environment.",
      style: "coverSubtitle",
    },
    { text: "", margin: [0, 16, 0, 0] },
    goldDivider(),
    { text: "", margin: [0, 6, 0, 0] },
    quoteBox(
      "The passage to the third period is also a passage to a development which is not natural, but social. … The human personality should be prepared for the unforeseen—not only for the immediate environment, but for the whole of the social world.",
      "Maria Montessori, From Childhood to Adolescence"
    ),
    { text: "", margin: [0, 30, 0, 0] },
    {
      text: "montessoriforadolescents.com",
      font: "Inter",
      fontSize: 11,
      color: GOLD,
      alignment: "center",
    },

    // ===================================================================
    // PAGE 2 — INTRODUCTION
    // ===================================================================
    sectionHeader("The Four Planes of Development", { pageBreak: true }),
    goldDivider(),

    bodyText(
      "Maria Montessori observed that human development from birth to maturity (age 24) unfolds across four distinct planes, each lasting approximately six years. Each plane has its own unique characteristics, sensitivities, and developmental needs."
    ),

    {
      table: {
        widths: ["*", "*"],
        body: [
          [
            {
              text: "First Plane (0–6)",
              font: "Lora",
              fontSize: 11,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
            },
            {
              text: "Second Plane (6–12)",
              font: "Lora",
              fontSize: 11,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
            },
          ],
          [
            {
              text: "The absorbent mind. Sensorial exploration. Creation of the individual self. Dramatic physical growth.",
              style: "body",
              margin: [8, 4, 8, 6],
            },
            {
              text: "The reasoning mind. Intellectual exploration. Moral development. Period of calm, stable growth.",
              style: "body",
              margin: [8, 4, 8, 6],
            },
          ],
          [
            {
              text: "Third Plane (12–18)",
              font: "Lora",
              fontSize: 11,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
            },
            {
              text: "Fourth Plane (18–24)",
              font: "Lora",
              fontSize: 11,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
            },
          ],
          [
            {
              text: "Social rebirth. Creation of the social self. Physical transformation. Emotional intensity.",
              style: "body",
              margin: [8, 4, 8, 6],
            },
            {
              text: "Maturity. Spiritual and moral independence. Specialization and contribution to society.",
              style: "body",
              margin: [8, 4, 8, 6],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => LAVENDER,
        vLineColor: () => LAVENDER,
      },
      margin: [0, 8, 0, 12],
    },

    subHeader("The Third Plane: A Period of Social Rebirth"),

    bodyText(
      "Montessori described the transition to adolescence as a \"social rebirth\"—a period as dramatic and transformative as the first plane of development. Just as the young child constructs the individual self, the adolescent constructs the social self."
    ),

    bodyText(
      "There are striking parallels between the First Plane (0–6) and the Third Plane (12–18):"
    ),

    bulletList([
      "Both are periods of dramatic physical transformation and rapid growth",
      "Both involve heightened sensitivity, vulnerability, and instability",
      "Both are creative periods where something entirely new is being constructed",
      "Both require specially prepared environments that support the developmental work",
      "In both periods, the child's energy is directed inward toward construction, which can result in decreased outward performance",
    ]),

    quoteBox(
      "We can establish a parallel between childhood and adolescence. In both we see a creative, constructive period, and in both there appears instability, both physical and mental, and both are periods of transformation.",
      "Maria Montessori"
    ),

    // ===================================================================
    // PAGE 3 — PHYSICAL CHARACTERISTICS
    // ===================================================================
    sectionHeader("Physical Characteristics", { pageBreak: true }),
    goldDivider(),

    bodyText(
      "The adolescent's body undergoes profound changes during the Third Plane. Montessori identified three sub-phases within this period, each with distinct physical characteristics:"
    ),

    {
      table: {
        widths: ["30%", "30%", "*"],
        body: [
          [
            {
              text: "Preparation\n(Ages 12–14)",
              font: "Lora",
              fontSize: 11,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
              alignment: "center",
            },
            {
              text: "Blooming\n(Ages 14–16)",
              font: "Lora",
              fontSize: 11,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
              alignment: "center",
            },
            {
              text: "Perfection\n(Ages 16–18)",
              font: "Lora",
              fontSize: 11,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
              alignment: "center",
            },
          ],
          [
            {
              text: "Onset of puberty. Rapid, uneven growth. The body becomes awkward and disproportionate. Energy fluctuates unpredictably.",
              style: "body",
              margin: [8, 4, 8, 6],
            },
            {
              text: "The body fills out and matures. Sexual development progresses. Physical energy increases but remains unsteady. Strength builds.",
              style: "body",
              margin: [8, 4, 8, 6],
            },
            {
              text: "The body reaches near-adult form. Physical coordination and grace return. Energy stabilizes. The young person becomes physically capable and confident.",
              style: "body",
              margin: [8, 4, 8, 6],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => LAVENDER,
        vLineColor: () => LAVENDER,
      },
      margin: [0, 8, 0, 12],
    },

    subHeader("Key Physical Needs"),

    {
      table: {
        widths: ["22%", "*"],
        body: [
          [
            {
              text: "Fatigue",
              font: "Lora",
              fontSize: 10,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
            },
            {
              text: "Adolescents tire easily and unpredictably. The enormous energy required for physical growth leaves less available for sustained intellectual work. Rest and sleep are essential—not laziness.",
              style: "body",
              margin: [8, 6, 8, 6],
            },
          ],
          [
            {
              text: "Nutrition",
              font: "Lora",
              fontSize: 10,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
            },
            {
              text: "The growing body has heightened nutritional needs. Montessori emphasized nourishing food—ideally grown and prepared by the adolescents themselves. A connection to the source of food supports both physical health and psychological well-being.",
              style: "body",
              margin: [8, 6, 8, 6],
            },
          ],
          [
            {
              text: "Exercise",
              font: "Lora",
              fontSize: 10,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
            },
            {
              text: "Physical activity is vital—not competitive sport, but purposeful work that engages the body: farming, building, maintaining the environment. The body needs to move and work in service of the community.",
              style: "body",
              margin: [8, 6, 8, 6],
            },
          ],
          [
            {
              text: "Illness",
              font: "Lora",
              fontSize: 10,
              color: PURPLE,
              fillColor: LIGHT_LAVENDER,
              margin: [8, 6, 8, 6],
            },
            {
              text: "Adolescents are more susceptible to illness during this period of transformation. The immune system is under strain from rapid growth. Adequate rest, nutrition, and time outdoors help support resilience.",
              style: "body",
              margin: [8, 6, 8, 6],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => LAVENDER,
        vLineColor: () => LAVENDER,
      },
      margin: [0, 4, 0, 12],
    },

    // ===================================================================
    // PAGE 4 — PSYCHOLOGICAL CHARACTERISTICS
    // ===================================================================
    sectionHeader("Psychological Characteristics", { pageBreak: true }),
    goldDivider(),

    bodyText(
      "The psychological landscape of the adolescent is complex and often misunderstood. The dramatic physical changes of this period have equally dramatic psychological effects. This is not a time of intellectual expansion—it is a time of inner construction."
    ),

    subHeader("Emotional Life"),

    bulletList([
      "Doubts and hesitations: The adolescent questions everything—themselves, their abilities, their place in the world.",
      "Violent emotions: Feelings are intense and shift rapidly. Joy, despair, anger, and tenderness coexist.",
      "Impulsivity combined with shyness: Bold one moment, self-conscious the next.",
      "Period of contemplation: A deep need for solitude, reflection, and time to process inner experience.",
    ]),

    subHeader("Intellectual Life"),

    bodyText(
      "There is often an apparent decrease in intellectual capacity during early adolescence. This is not a decline in intelligence but a redirection of energy—the body's enormous growth demands so much that less is available for abstract thinking. This is why Montessori advocated for practical, hands-on learning during this period."
    ),

    subHeader("Core Sensitivities"),

    {
      table: {
        widths: ["*", "*"],
        body: [
          [
            {
              stack: [
                {
                  text: "Personal Dignity",
                  font: "Lora",
                  fontSize: 11,
                  color: PURPLE,
                  margin: [8, 6, 8, 4],
                },
                {
                  text: "The adolescent is acutely sensitive to how they are perceived and treated. Criticism and being treated as a child wound deeply. They need to be respected as emerging adults—their opinions heard and their competence acknowledged.",
                  style: "body",
                  margin: [8, 0, 8, 8],
                },
              ],
              fillColor: LIGHT_LAVENDER,
            },
            {
              stack: [
                {
                  text: "Justice",
                  font: "Lora",
                  fontSize: 11,
                  color: PURPLE,
                  margin: [8, 6, 8, 4],
                },
                {
                  text: "Adolescents develop a powerful sense of right and wrong. They are deeply concerned with fairness—both for themselves and for others. This extends to social justice, environmental concerns, and moral questions about society.",
                  style: "body",
                  margin: [8, 0, 8, 8],
                },
              ],
              fillColor: LIGHT_LAVENDER,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 4,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 4, 0, 8],
    },

    subHeader("Imagining the Future"),

    bodyText(
      "The adolescent begins to imagine their future self and their place in the adult world. They wonder: Who will I become? What is my value? How will I contribute? These questions are essential psychological work—the adolescent is constructing a vision of their future that will guide their choices and development."
    ),

    // ===================================================================
    // PAGE 5 — SOCIAL CHARACTERISTICS
    // ===================================================================
    sectionHeader("Social Characteristics", { pageBreak: true }),
    goldDivider(),

    bodyText(
      "The Third Plane is fundamentally a social period. Montessori described the adolescent as a \"newborn social being\"—someone who is leaving the shelter of the family and stepping into the wider world of society. This transition is as significant as the infant's entry into the physical world."
    ),

    subHeader("From Family to Society"),

    bodyText(
      "In the third plane, the adolescent's orientation shifts outward from family to peer groups, communities, and society at large. This is not rebellion—it is a developmental imperative to construct the social self."
    ),

    subHeader("Core Social Needs"),

    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                {
                  text: "Social Belonging",
                  font: "Lora",
                  fontSize: 11,
                  color: PURPLE,
                  margin: [10, 8, 10, 2],
                },
                {
                  text: "The adolescent needs to feel accepted and valued by a group. Peer relationships become central as they learn to navigate social dynamics, resolve conflicts, and contribute to a community.",
                  style: "body",
                  margin: [10, 2, 10, 10],
                },
              ],
              fillColor: LIGHT_LAVENDER,
            },
          ],
          [
            {
              stack: [
                {
                  text: "Moral Understanding",
                  font: "Lora",
                  fontSize: 11,
                  color: PURPLE,
                  margin: [10, 8, 10, 2],
                },
                {
                  text: "The adolescent now grapples with complex ethical questions and needs opportunities to explore moral dilemmas, discuss values, and develop their own moral framework—through real experiences, not lectures.",
                  style: "body",
                  margin: [10, 2, 10, 10],
                },
              ],
            },
          ],
          [
            {
              stack: [
                {
                  text: "Economic Independence",
                  font: "Lora",
                  fontSize: 11,
                  color: PURPLE,
                  margin: [10, 8, 10, 2],
                },
                {
                  text: "The adolescent needs to experience earning through their own productive work—not career preparation, but the psychological experience of being capable and contributing to the adult world.",
                  style: "body",
                  margin: [10, 2, 10, 10],
                },
              ],
              fillColor: LIGHT_LAVENDER,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => LAVENDER,
      },
      margin: [0, 4, 0, 12],
    },

    subHeader("Valorization & Erdkinder"),

    bodyText(
      "Montessori used the term \"valorization\" to describe the adolescent's need to feel that they are a person of value. This is achieved not through praise or grades but through authentic experiences of competence, responsibility, and service."
    ),

    bodyText(
      "She proposed the Erdkinder (\"children of the earth\")—a farm school where young people live and work together. Its principles of connection to nature, meaningful work, community living, and economic participation can be adapted to many settings."
    ),

    // ===================================================================
    // PAGE 6 — WHAT ADOLESCENTS NEED
    // ===================================================================
    sectionHeader("What Adolescents Need", { pageBreak: true }),
    goldDivider(),

    bodyText(
      "Understanding the characteristics of the Third Plane leads us to a clear picture of what adolescents need in order to develop fully. Montessori's vision was not merely theoretical—she offered practical principles for supporting adolescent development."
    ),

    {
      table: {
        widths: ["*", "*"],
        body: [
          [
            {
              stack: [
                {
                  text: "Meaningful Work",
                  font: "Lora",
                  fontSize: 12,
                  color: PURPLE,
                  alignment: "center",
                  margin: [8, 10, 8, 4],
                },
                {
                  text: "Work that has real purpose and serves the community—productive activity that engages both body and mind.",
                  style: "body",
                  alignment: "center",
                  margin: [8, 0, 8, 8],
                },
              ],
              fillColor: LIGHT_LAVENDER,
            },
            {
              stack: [
                {
                  text: "A Prepared Environment",
                  font: "Lora",
                  fontSize: 12,
                  color: PURPLE,
                  alignment: "center",
                  margin: [8, 10, 8, 4],
                },
                {
                  text: "An environment designed for adolescent needs—offering physical activity, intellectual engagement, social interaction, solitude, structure, and freedom.",
                  style: "body",
                  alignment: "center",
                  margin: [8, 0, 8, 8],
                },
              ],
              fillColor: LIGHT_LAVENDER,
            },
          ],
          [
            {
              stack: [
                {
                  text: "Social Experience",
                  font: "Lora",
                  fontSize: 12,
                  color: PURPLE,
                  alignment: "center",
                  margin: [8, 10, 8, 4],
                },
                {
                  text: "Genuine opportunities to live and work with peers, navigate relationships, and contribute to a community.",
                  style: "body",
                  alignment: "center",
                  margin: [8, 0, 8, 8],
                },
              ],
              fillColor: LIGHT_LAVENDER,
            },
            {
              stack: [
                {
                  text: "Real Independence",
                  font: "Lora",
                  fontSize: 12,
                  color: PURPLE,
                  alignment: "center",
                  margin: [8, 10, 8, 4],
                },
                {
                  text: "The freedom to make real choices and manage real responsibilities—with the support of caring adults who trust their emerging competence.",
                  style: "body",
                  alignment: "center",
                  margin: [8, 0, 8, 8],
                },
              ],
              fillColor: LIGHT_LAVENDER,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 4,
        vLineWidth: () => 4,
        hLineColor: () => CREAM,
        vLineColor: () => CREAM,
      },
      margin: [0, 6, 0, 10],
    },

    subHeader("Montessori's Vision: A Center of Study and Work"),

    bodyText(
      "Montessori envisioned a \"Center of Study and Work\" where academic learning is integrated with productive work, young people live in community, and character development is valued alongside intellectual growth. Key elements include a connection to the land, a student-run business, real-world academics, creative expression, and adult guides who mentor rather than lecture."
    ),

    { text: "", margin: [0, 4, 0, 0] },
    goldDivider(),
    { text: "", margin: [0, 4, 0, 0] },

    {
      text: "Learn More",
      font: "Lora",
      fontSize: 14,
      color: PURPLE,
      alignment: "center",
      margin: [0, 0, 0, 6],
    },

    {
      text: "Visit montessoriforadolescents.com for more resources on Montessori for adolescents, live webinars, and to request help starting your own Center for Study and Work.",
      style: "body",
      alignment: "center",
      margin: [20, 0, 20, 8],
    },

    {
      image: logoDataUri,
      width: 35,
      alignment: "center",
    },

    {
      text: "Content sourced from AMI Diploma 12–18 Theory & Methodology Album and the writings of Maria Montessori.",
      font: "Inter",
      fontSize: 7,
      color: EARTH,
      alignment: "center",
      margin: [20, 4, 20, 0],
      opacity: 0.7,
    },
  ],
};

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

async function generate() {
  const printer = new PdfPrinter(fonts);
  const pdfDoc = await printer.createPdfKitDocument(docDefinition);

  const outputDir = path.join(ROOT, "public", "downloads");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "third-plane-worksheet.pdf");
  const writeStream = fs.createWriteStream(outputPath);

  pdfDoc.pipe(writeStream);
  pdfDoc.end();

  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => {
      console.log(`PDF generated: ${outputPath}`);
      resolve();
    });
    writeStream.on("error", (err) => {
      console.error("Error writing PDF:", err);
      reject(err);
    });
  });
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
