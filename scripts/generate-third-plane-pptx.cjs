const fs = require("fs");
const path = require("path");
const PptxGenJS = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Colors (hex without #)
// ---------------------------------------------------------------------------
const PURPLE = "3f265b";
const GOLD = "C4A94D";
const LAVENDER = "e4d2f8";
const CREAM = "FAF7F2";
const EARTH = "5C4A3A";
const LIGHT_LAVENDER = "f3ebfc";

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------
const logoPath = path.join(ROOT, "logo gold.png");
const logoBase64 = fs.readFileSync(logoPath).toString("base64");
const logoDataUri = `image/png;base64,${logoBase64}`;

// ---------------------------------------------------------------------------
// Create presentation
// ---------------------------------------------------------------------------
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches — good for Canva
pptx.author = "Montessori for Adolescents";
pptx.title = "Characteristics of the Third Plane of Development";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MARGIN_LEFT = 0.8;
const MARGIN_RIGHT = 0.8;
const CONTENT_W = 13.33 - MARGIN_LEFT - MARGIN_RIGHT;

function addGoldLine(slide, y) {
  slide.addShape(pptx.ShapeType.line, {
    x: MARGIN_LEFT,
    y,
    w: CONTENT_W,
    h: 0,
    line: { color: GOLD, width: 1.5 },
  });
}

function addSectionHeader(slide, text, y) {
  slide.addText(text, {
    x: MARGIN_LEFT,
    y,
    w: CONTENT_W,
    h: 0.55,
    fontSize: 24,
    fontFace: "Lora",
    color: PURPLE,
    bold: true,
  });
}

function addSubHeader(slide, text, y) {
  slide.addText(text, {
    x: MARGIN_LEFT,
    y,
    w: CONTENT_W,
    h: 0.35,
    fontSize: 15,
    fontFace: "Lora",
    color: PURPLE,
    bold: true,
  });
}

function addBody(slide, text, y, opts = {}) {
  slide.addText(text, {
    x: opts.x || MARGIN_LEFT,
    y,
    w: opts.w || CONTENT_W,
    h: opts.h || 0.5,
    fontSize: opts.fontSize || 11,
    fontFace: "Inter",
    color: EARTH,
    lineSpacingMultiple: 1.3,
    valign: "top",
    ...opts,
  });
}

function addQuoteBox(slide, quote, attribution, y) {
  const boxH = attribution ? 1.2 : 0.9;
  // Left gold bar
  slide.addShape(pptx.ShapeType.rect, {
    x: MARGIN_LEFT,
    y,
    w: 0.06,
    h: boxH,
    fill: { color: GOLD },
  });
  // Background
  slide.addShape(pptx.ShapeType.rect, {
    x: MARGIN_LEFT + 0.06,
    y,
    w: CONTENT_W - 0.06,
    h: boxH,
    fill: { color: LIGHT_LAVENDER },
  });
  // Quote text
  slide.addText(`"${quote}"`, {
    x: MARGIN_LEFT + 0.3,
    y: y + 0.1,
    w: CONTENT_W - 0.6,
    h: boxH - (attribution ? 0.45 : 0.2),
    fontSize: 12,
    fontFace: "Lora",
    italic: true,
    color: PURPLE,
    align: "center",
    valign: "middle",
  });
  if (attribution) {
    slide.addText(`— ${attribution}`, {
      x: MARGIN_LEFT + 0.3,
      y: y + boxH - 0.35,
      w: CONTENT_W - 0.6,
      h: 0.25,
      fontSize: 10,
      fontFace: "Inter",
      color: GOLD,
      align: "center",
    });
  }
}

function addLavenderBox(slide, title, body, x, y, w, h) {
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: LIGHT_LAVENDER },
    rectRadius: 0.05,
  });
  slide.addText(title, {
    x: x + 0.15,
    y: y + 0.08,
    w: w - 0.3,
    h: 0.3,
    fontSize: 13,
    fontFace: "Lora",
    color: PURPLE,
    bold: true,
    valign: "top",
  });
  slide.addText(body, {
    x: x + 0.15,
    y: y + 0.35,
    w: w - 0.3,
    h: h - 0.45,
    fontSize: 10,
    fontFace: "Inter",
    color: EARTH,
    lineSpacingMultiple: 1.3,
    valign: "top",
  });
}

function addTableRow(slide, label, body, y, fillColor) {
  const labelW = 1.6;
  if (fillColor) {
    slide.addShape(pptx.ShapeType.rect, {
      x: MARGIN_LEFT,
      y,
      w: labelW,
      h: 0.6,
      fill: { color: fillColor },
    });
  }
  slide.addText(label, {
    x: MARGIN_LEFT + 0.1,
    y,
    w: labelW - 0.2,
    h: 0.6,
    fontSize: 11,
    fontFace: "Lora",
    color: PURPLE,
    valign: "middle",
  });
  slide.addText(body, {
    x: MARGIN_LEFT + labelW + 0.1,
    y,
    w: CONTENT_W - labelW - 0.2,
    h: 0.6,
    fontSize: 10,
    fontFace: "Inter",
    color: EARTH,
    lineSpacingMultiple: 1.2,
    valign: "middle",
  });
}

// Set all slides to cream background
function newSlide() {
  const slide = pptx.addSlide();
  slide.background = { fill: CREAM };
  // Footer
  slide.addText("montessoriforadolescents.com", {
    x: MARGIN_LEFT,
    y: 7.05,
    w: 3,
    h: 0.3,
    fontSize: 8,
    fontFace: "Inter",
    color: GOLD,
  });
  return slide;
}

// ===================================================================
// SLIDE 1 — COVER
// ===================================================================
const slide1 = newSlide();

slide1.addImage({
  data: logoDataUri,
  x: 5.67,
  y: 0.8,
  w: 2.0,
  h: 2.0,
});

slide1.addText("Montessori for\nAdolescents 101", {
  x: 1.5,
  y: 3.0,
  w: 10.33,
  h: 1.2,
  fontSize: 36,
  fontFace: "Lora",
  color: PURPLE,
  align: "center",
  lineSpacingMultiple: 1.2,
});

slide1.addText("Overview of the characteristics, needs,\nand prepared environment.", {
  x: 2.5,
  y: 4.3,
  w: 8.33,
  h: 0.7,
  fontSize: 16,
  fontFace: "Inter",
  color: EARTH,
  align: "center",
  lineSpacingMultiple: 1.3,
});

addGoldLine(slide1, 5.15);

addQuoteBox(
  slide1,
  "The passage to the third period is also a passage to a development which is not natural, but social. … The human personality should be prepared for the unforeseen—not only for the immediate environment, but for the whole of the social world.",
  "Maria Montessori, From Childhood to Adolescence",
  5.4
);

slide1.addText("montessoriforadolescents.com", {
  x: 3.5,
  y: 6.8,
  w: 6.33,
  h: 0.4,
  fontSize: 14,
  fontFace: "Inter",
  color: GOLD,
  align: "center",
});

// ===================================================================
// SLIDE 2 — INTRODUCTION
// ===================================================================
const slide2 = newSlide();

addSectionHeader(slide2, "The Four Planes of Development", 0.4);
addGoldLine(slide2, 0.9);

addBody(
  slide2,
  "Maria Montessori observed that human development from birth to maturity (age 24) unfolds across four distinct planes, each lasting approximately six years. Each plane has its own unique characteristics, sensitivities, and developmental needs.",
  1.05,
  { h: 0.55 }
);

// Four planes grid
const colW = CONTENT_W / 2 - 0.05;
const gridX1 = MARGIN_LEFT;
const gridX2 = MARGIN_LEFT + colW + 0.1;

addLavenderBox(slide2, "First Plane (0–6)", "The absorbent mind. Sensorial exploration. Creation of the individual self. Dramatic physical growth.", gridX1, 1.65, colW, 0.8);
addLavenderBox(slide2, "Second Plane (6–12)", "The reasoning mind. Intellectual exploration. Moral development. Period of calm, stable growth.", gridX2, 1.65, colW, 0.8);
addLavenderBox(slide2, "Third Plane (12–18)", "Social rebirth. Creation of the social self. Physical transformation. Emotional intensity.", gridX1, 2.55, colW, 0.8);
addLavenderBox(slide2, "Fourth Plane (18–24)", "Maturity. Spiritual and moral independence. Specialization and contribution to society.", gridX2, 2.55, colW, 0.8);

addSubHeader(slide2, "The Third Plane: A Period of Social Rebirth", 3.55);

addBody(
  slide2,
  'Montessori described the transition to adolescence as a "social rebirth"—a period as dramatic and transformative as the first plane. Just as the young child constructs the individual self, the adolescent constructs the social self.\n\nThere are striking parallels between the First Plane (0–6) and the Third Plane (12–18):',
  3.85,
  { h: 0.85 }
);

const bullets2 = [
  "Both are periods of dramatic physical transformation and rapid growth",
  "Both involve heightened sensitivity, vulnerability, and instability",
  "Both are creative periods where something entirely new is being constructed",
  "Both require specially prepared environments that support the developmental work",
  "In both periods, energy is directed inward toward construction, which can result in decreased outward performance",
];
slide2.addText(bullets2.map((b) => ({ text: b, options: { bullet: true, indentLevel: 0 } })), {
  x: MARGIN_LEFT + 0.2,
  y: 4.7,
  w: CONTENT_W - 0.4,
  h: 1.3,
  fontSize: 10,
  fontFace: "Inter",
  color: EARTH,
  lineSpacingMultiple: 1.3,
  valign: "top",
});

addQuoteBox(
  slide2,
  "We can establish a parallel between childhood and adolescence. In both we see a creative, constructive period, and in both there appears instability, both physical and mental, and both are periods of transformation.",
  "Maria Montessori",
  6.1
);

// ===================================================================
// SLIDE 3 — PHYSICAL CHARACTERISTICS
// ===================================================================
const slide3 = newSlide();

addSectionHeader(slide3, "Physical Characteristics", 0.4);
addGoldLine(slide3, 0.9);

addBody(
  slide3,
  "The adolescent's body undergoes profound changes during the Third Plane. Montessori identified three sub-phases within this period, each with distinct physical characteristics:",
  1.05,
  { h: 0.5 }
);

// Three phases
const phaseW = CONTENT_W / 3 - 0.07;
const phaseY = 1.55;

function addPhaseBox(slide, title, body, x) {
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y: phaseY,
    w: phaseW,
    h: 0.35,
    fill: { color: LIGHT_LAVENDER },
  });
  slide.addText(title, {
    x,
    y: phaseY,
    w: phaseW,
    h: 0.35,
    fontSize: 12,
    fontFace: "Lora",
    color: PURPLE,
    align: "center",
    valign: "middle",
    bold: true,
  });
  slide.addText(body, {
    x: x + 0.1,
    y: phaseY + 0.4,
    w: phaseW - 0.2,
    h: 0.8,
    fontSize: 9.5,
    fontFace: "Inter",
    color: EARTH,
    lineSpacingMultiple: 1.2,
    valign: "top",
  });
}

addPhaseBox(slide3, "Preparation (12–14)", "Onset of puberty. Rapid, uneven growth. The body becomes awkward and disproportionate. Energy fluctuates unpredictably.", MARGIN_LEFT);
addPhaseBox(slide3, "Blooming (14–16)", "The body fills out and matures. Sexual development progresses. Physical energy increases but remains unsteady. Strength builds.", MARGIN_LEFT + phaseW + 0.1);
addPhaseBox(slide3, "Perfection (16–18)", "The body reaches near-adult form. Physical coordination and grace return. Energy stabilizes. The young person becomes physically capable.", MARGIN_LEFT + (phaseW + 0.1) * 2);

addSubHeader(slide3, "Key Physical Needs", 2.85);

const needsY = 3.2;
const needH = 0.75;
const needs = [
  ["Fatigue", "Adolescents tire easily and unpredictably. The enormous energy required for physical growth leaves less available for sustained intellectual work. Rest and sleep are essential—not laziness."],
  ["Nutrition", "The growing body has heightened nutritional needs. Montessori emphasized nourishing food—ideally grown and prepared by the adolescents themselves."],
  ["Exercise", "Physical activity is vital—not competitive sport, but purposeful work that engages the body: farming, building, maintaining the environment."],
  ["Illness", "Adolescents are more susceptible to illness during this period. The immune system is under strain from rapid growth. Rest, nutrition, and time outdoors help support resilience."],
];

needs.forEach(([label, body], i) => {
  const rowY = needsY + i * needH;
  const fill = i % 2 === 0 ? LIGHT_LAVENDER : null;

  // Label background
  slide3.addShape(pptx.ShapeType.rect, {
    x: MARGIN_LEFT,
    y: rowY,
    w: 2.2,
    h: needH,
    fill: { color: LIGHT_LAVENDER },
  });
  slide3.addText(label, {
    x: MARGIN_LEFT + 0.15,
    y: rowY,
    w: 1.9,
    h: needH,
    fontSize: 12,
    fontFace: "Lora",
    color: PURPLE,
    valign: "middle",
  });
  // Divider line
  slide3.addShape(pptx.ShapeType.line, {
    x: MARGIN_LEFT,
    y: rowY + needH,
    w: CONTENT_W,
    h: 0,
    line: { color: LAVENDER, width: 0.5 },
  });
  slide3.addText(body, {
    x: MARGIN_LEFT + 2.4,
    y: rowY + 0.05,
    w: CONTENT_W - 2.5,
    h: needH - 0.1,
    fontSize: 10,
    fontFace: "Inter",
    color: EARTH,
    lineSpacingMultiple: 1.2,
    valign: "middle",
  });
});

// ===================================================================
// SLIDE 4 — PSYCHOLOGICAL CHARACTERISTICS
// ===================================================================
const slide4 = newSlide();

addSectionHeader(slide4, "Psychological Characteristics", 0.4);
addGoldLine(slide4, 0.9);

addBody(
  slide4,
  "The psychological landscape of the adolescent is complex and often misunderstood. The dramatic physical changes of this period have equally dramatic psychological effects. This is not a time of intellectual expansion—it is a time of inner construction.",
  1.05,
  { h: 0.55 }
);

addSubHeader(slide4, "Emotional Life", 1.55);

const emoBullets = [
  "Doubts and hesitations: The adolescent questions everything—themselves, their abilities, their place in the world.",
  "Violent emotions: Feelings are intense and shift rapidly. Joy, despair, anger, and tenderness coexist.",
  "Impulsivity combined with shyness: Bold one moment, self-conscious the next.",
  "Period of contemplation: A deep need for solitude, reflection, and time to process inner experience.",
];
slide4.addText(emoBullets.map((b) => ({ text: b, options: { bullet: true } })), {
  x: MARGIN_LEFT + 0.2,
  y: 1.85,
  w: CONTENT_W - 0.4,
  h: 1.15,
  fontSize: 10,
  fontFace: "Inter",
  color: EARTH,
  lineSpacingMultiple: 1.25,
  valign: "top",
});

addSubHeader(slide4, "Intellectual Life", 3.05);

addBody(
  slide4,
  "There is often an apparent decrease in intellectual capacity during early adolescence. This is not a decline in intelligence but a redirection of energy—the body's enormous growth demands so much that less is available for abstract thinking. This is why Montessori advocated for practical, hands-on learning during this period.",
  3.35,
  { h: 0.6 }
);

addSubHeader(slide4, "Core Sensitivities", 4.0);

const sensW = CONTENT_W / 2 - 0.05;
addLavenderBox(
  slide4,
  "Personal Dignity",
  "The adolescent is acutely sensitive to how they are perceived and treated. Criticism and being treated as a child wound deeply. They need to be respected as emerging adults—their opinions heard and their competence acknowledged.",
  MARGIN_LEFT,
  4.3,
  sensW,
  1.15
);
addLavenderBox(
  slide4,
  "Justice",
  "Adolescents develop a powerful sense of right and wrong. They are deeply concerned with fairness—both for themselves and for others. This extends to social justice, environmental concerns, and moral questions about society.",
  MARGIN_LEFT + sensW + 0.1,
  4.3,
  sensW,
  1.15
);

addSubHeader(slide4, "Imagining the Future", 5.6);

addBody(
  slide4,
  "The adolescent begins to imagine their future self and their place in the adult world. They wonder: Who will I become? What is my value? How will I contribute? These questions are essential psychological work—the adolescent is constructing a vision of their future that will guide their choices and development.",
  5.9,
  { h: 0.7 }
);

// ===================================================================
// SLIDE 5 — SOCIAL CHARACTERISTICS
// ===================================================================
const slide5 = newSlide();

addSectionHeader(slide5, "Social Characteristics", 0.4);
addGoldLine(slide5, 0.9);

addBody(
  slide5,
  'The Third Plane is fundamentally a social period. Montessori described the adolescent as a "newborn social being"—someone who is leaving the shelter of the family and stepping into the wider world of society.',
  1.05,
  { h: 0.45 }
);

addSubHeader(slide5, "From Family to Society", 1.5);

addBody(
  slide5,
  "In the third plane, the adolescent's orientation shifts outward from family to peer groups, communities, and society at large. This is not rebellion—it is a developmental imperative to construct the social self.",
  1.8,
  { h: 0.45 }
);

addSubHeader(slide5, "Core Social Needs", 2.3);

const socialNeeds = [
  ["Social Belonging", "The adolescent needs to feel accepted and valued by a group. Peer relationships become central as they learn to navigate social dynamics, resolve conflicts, and contribute to a community."],
  ["Moral Understanding", "The adolescent now grapples with complex ethical questions and needs opportunities to explore moral dilemmas, discuss values, and develop their own moral framework—through real experiences, not lectures."],
  ["Economic Independence", "The adolescent needs to experience earning through their own productive work—not career preparation, but the psychological experience of being capable and contributing to the adult world."],
];

socialNeeds.forEach(([title, body], i) => {
  const rowY = 2.65 + i * 0.85;
  const fill = i % 2 === 0 ? LIGHT_LAVENDER : null;
  if (fill) {
    slide5.addShape(pptx.ShapeType.rect, {
      x: MARGIN_LEFT,
      y: rowY,
      w: CONTENT_W,
      h: 0.8,
      fill: { color: fill },
    });
  }
  slide5.addText(title, {
    x: MARGIN_LEFT + 0.15,
    y: rowY + 0.05,
    w: CONTENT_W - 0.3,
    h: 0.25,
    fontSize: 12,
    fontFace: "Lora",
    color: PURPLE,
    bold: true,
  });
  slide5.addText(body, {
    x: MARGIN_LEFT + 0.15,
    y: rowY + 0.3,
    w: CONTENT_W - 0.3,
    h: 0.45,
    fontSize: 10,
    fontFace: "Inter",
    color: EARTH,
    lineSpacingMultiple: 1.2,
    valign: "top",
  });
  // Divider
  slide5.addShape(pptx.ShapeType.line, {
    x: MARGIN_LEFT,
    y: rowY + 0.8,
    w: CONTENT_W,
    h: 0,
    line: { color: LAVENDER, width: 0.5 },
  });
});

addSubHeader(slide5, "Valorization & Erdkinder", 5.25);

addBody(
  slide5,
  'Montessori used the term "valorization" to describe the adolescent\'s need to feel that they are a person of value. This is achieved not through praise or grades but through authentic experiences of competence, responsibility, and service.',
  5.55,
  { h: 0.45 }
);

addBody(
  slide5,
  'She proposed the Erdkinder ("children of the earth")—a farm school where young people live and work together. Its principles of connection to nature, meaningful work, community living, and economic participation can be adapted to many settings.',
  6.0,
  { h: 0.55 }
);

// ===================================================================
// SLIDE 6 — WHAT ADOLESCENTS NEED
// ===================================================================
const slide6 = newSlide();

addSectionHeader(slide6, "What Adolescents Need", 0.4);
addGoldLine(slide6, 0.9);

addBody(
  slide6,
  "Understanding the characteristics of the Third Plane leads us to a clear picture of what adolescents need in order to develop fully. Montessori's vision was not merely theoretical—she offered practical principles for supporting adolescent development.",
  1.05,
  { h: 0.5 }
);

// Four quadrants
const qW = CONTENT_W / 2 - 0.08;
const qH = 1.1;
const qY1 = 1.6;
const qY2 = qY1 + qH + 0.08;
const qX1 = MARGIN_LEFT;
const qX2 = MARGIN_LEFT + qW + 0.16;

function addQuadrant(slide, title, body, x, y) {
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: qW,
    h: qH,
    fill: { color: LIGHT_LAVENDER },
    rectRadius: 0.05,
  });
  slide.addText(title, {
    x,
    y: y + 0.1,
    w: qW,
    h: 0.3,
    fontSize: 14,
    fontFace: "Lora",
    color: PURPLE,
    bold: true,
    align: "center",
  });
  slide.addText(body, {
    x: x + 0.2,
    y: y + 0.4,
    w: qW - 0.4,
    h: qH - 0.5,
    fontSize: 10,
    fontFace: "Inter",
    color: EARTH,
    align: "center",
    lineSpacingMultiple: 1.2,
    valign: "top",
  });
}

addQuadrant(slide6, "Meaningful Work", "Work that has real purpose and serves the community—productive activity that engages both body and mind.", qX1, qY1);
addQuadrant(slide6, "A Prepared Environment", "An environment designed for adolescent needs—offering physical activity, intellectual engagement, social interaction, solitude, structure, and freedom.", qX2, qY1);
addQuadrant(slide6, "Social Experience", "Genuine opportunities to live and work with peers, navigate relationships, and contribute to a community.", qX1, qY2);
addQuadrant(slide6, "Real Independence", "The freedom to make real choices and manage real responsibilities—with the support of caring adults who trust their emerging competence.", qX2, qY2);

addSubHeader(slide6, "Montessori's Vision: A Center of Study and Work", 3.95);

addBody(
  slide6,
  'Montessori envisioned a "Center of Study and Work" where academic learning is integrated with productive work, young people live in community, and character development is valued alongside intellectual growth. Key elements include a connection to the land, a student-run business, real-world academics, creative expression, and adult guides who mentor rather than lecture.',
  4.25,
  { h: 0.7 }
);

addGoldLine(slide6, 5.05);

slide6.addText("Learn More", {
  x: 2,
  y: 5.2,
  w: 9.33,
  h: 0.35,
  fontSize: 16,
  fontFace: "Lora",
  color: PURPLE,
  align: "center",
});

slide6.addText("Visit montessoriforadolescents.com for more resources on Montessori for adolescents, live webinars, and to request help starting your own Center for Study and Work.", {
  x: 2,
  y: 5.55,
  w: 9.33,
  h: 0.4,
  fontSize: 11,
  fontFace: "Inter",
  color: EARTH,
  align: "center",
});

slide6.addImage({
  data: logoDataUri,
  x: 6.17,
  y: 6.05,
  w: 1.0,
  h: 1.0,
});

slide6.addText("Content sourced from AMI Diploma 12–18 Theory & Methodology Album and the writings of Maria Montessori.", {
  x: 2,
  y: 6.85,
  w: 9.33,
  h: 0.25,
  fontSize: 7,
  fontFace: "Inter",
  color: EARTH,
  align: "center",
});

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
const outputDir = path.join(ROOT, "public", "downloads");
fs.mkdirSync(outputDir, { recursive: true });

const outputPath = path.join(outputDir, "third-plane-worksheet.pptx");
pptx.writeFile({ fileName: outputPath }).then(() => {
  console.log(`PPTX generated: ${outputPath}`);
});
