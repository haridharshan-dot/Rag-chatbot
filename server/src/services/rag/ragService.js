import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { GeminiService } from "./geminiService.js";
import { ClaudeService } from "./claudeService.js";
import { createVectorStore } from "./vectorStore.js";
import { createEmbeddings } from "./embeddingService.js";
import { loadChunksFromDirectory } from "./chunkService.js";
import { getRuntimeSettings } from "../adminSettingsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OFFICIAL_WEBSITE_URL = "https://www.sonatech.ac.in/";
const GOOGLE_SEARCH_URL = "https://www.google.com/search?q=Sona+College+of+Technology";
const GOOGLE_MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Sona+College+of+Technology";
const SONA_PRINCIPAL_NAME = "Dr.SRR Senthil Kumar";
const SONA_CHAIRMAN_NAME = "Thiru M. S. Chockalingam";

function buildLiveAgentAndWebsiteMessage() {
  return [
    "The live agent option is on top. Please activate it and talk to a live agent.",
    `For more information, please visit the official website: ${OFFICIAL_WEBSITE_URL}`,
  ].join("\n");
}

function normalizeScore(rawScore) {
  if (!Number.isFinite(rawScore)) return 0;

  if (rawScore >= -1 && rawScore <= 1) {
    return (rawScore + 1) / 2;
  }

  return 1 / (1 + Math.max(rawScore, 0));
}

function isGreetingOnly(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(hi|hii|hello|hey|yo|good morning|good afternoon|good evening)$/.test(normalized);
}

function isGreetingOrSmallTalk(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  if (isGreetingOnly(normalized)) return true;

  return /^(hi|hii|hello|hey)\b.*\b(how are you|how r you|how are u|wassup|what s up|whatsup)\b/.test(normalized);
}

function isGeneralCollegeOverviewQuestion(question) {
  const q = String(question || "").toLowerCase();
  const hasOverviewIntent =
    /\b(about|overview|details|information|info|something)\b/.test(q) ||
    /\b(know|say|tell|explain|describe)\b/.test(q);
  const mentionsCollege = /\b(college|sona|sona college|sona college of technology)\b/.test(q);

  return (
    (/\b(about this college|about the college|about college|know about this college|know about the college|know about college|tell me about this college|tell me about college|college information|college details|all details about college|full details about college|about sona|sona college)\b/.test(
      q
    ) ||
      (hasOverviewIntent && mentionsCollege)) &&
    !isCutoffQuestion(q)
  );
}

function getCandidateDataDirs() {
  return [
    env.dataDir,
    path.resolve(process.cwd(), "data/sample"),
    path.resolve(process.cwd(), "server/data/sample"),
    path.resolve(__dirname, "../../../../data/sample"),
    path.resolve(__dirname, "../../../data/sample"),
  ].filter(Boolean);
}

function isCutoffQuestion(question) {
  return /\bcutoff|cut off\b/i.test(String(question || ""));
}

function isRestrictedFeeQuestion(question) {
  return /\bfees?\b|\bfee structure\b|\btuition\b|\bpayment\b|\brefund\b|\binstallment\b|\bhostel fee\b|\blab fee\b|\bexam fee\b/i.test(
    String(question || "")
  );
}

function isCollegeRelatedQuestion(question) {
  return /\b(college|sona|admission|cutoff|courses?|department|eligibility|scholarship|fees?|hostel|placement|deadline|counselling|documents?|marksheet|certificate|id proof)\b/i.test(
    String(question || "")
  );
}

function classifyFaqIntent(question) {
  const q = String(question || "").toLowerCase();
  if (/\beligibility|criteria\b/.test(q)) return "eligibility";
  if (/\bdocuments?|marksheet|certificate|id proof|passport|transfer certificate\b/.test(q))
    return "documents";
  if (/\bdeadline|last date|counselling|counseling|admission date|important date\b/.test(q))
    return "deadline";
  if (/\bhostel\b/.test(q)) return "hostel_fee";
  if (/\btuition\b/.test(q)) return "tuition_fee";
  if (/\blab\b|\bexam fee\b/.test(q)) return "lab_exam_fee";
  if (/\bfees?\b|\bfee structure\b/.test(q)) return "fees";
  if (/\bcourses?|programs?|department\b/.test(q)) return "courses";
  return null;
}

function isCollegeProfileQuestion(question) {
  const q = String(question || "").toLowerCase();
  if (!q) return false;
  if (isCutoffQuestion(q)) return false;

  return /\b(college|sona|ranking|rankings|facility|facilities|library|hostel|apple lab|industry|tie up|tie-up|rd|r&d|research|campus|admission)\b/.test(
    q
  );
}

function isPrincipalQuestion(question) {
  const q = String(question || "").toLowerCase();
  return /\bprincipal\b/.test(q) && /\b(sona|college)\b/.test(q);
}

function buildPrincipalResponse() {
  return `Principal: ${SONA_PRINCIPAL_NAME}`;
}

function isChairmanQuestion(question) {
  const q = String(question || "").toLowerCase();
  return /\bchairman\b/.test(q) && /\b(sona|college)\b/.test(q);
}

function buildChairmanResponse() {
  return `The chairman of Sona College of Technology is ${SONA_CHAIRMAN_NAME}.`;
}

function isWebsiteQuestion(question) {
  const q = String(question || "").toLowerCase();
  if (!q) return false;
  return /\b(website|site|web\s*site|official site|official website|link|url)\b/.test(q);
}

const KNOWN_DEPARTMENT_PATTERN =
  /\b(cse|it|ece|eee|mech|mechanical|civil|ft|fashion technology|ads|aids|aml|aiml|ai ml|ai and ml|ai ds|ai and ds)\b/i;

const INVALID_QUERY_FALLBACK = "Please ask a question so I can help you.";

function validateUserQuery(question) {
  const normalized = String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return { valid: false, message: INVALID_QUERY_FALLBACK };
  }

  if (isCutoffQuestion(normalized) && !KNOWN_DEPARTMENT_PATTERN.test(normalized)) {
    return {
      valid: false,
      message: "Please specify department and category (e.g., CSE OC cutoff).",
    };
  }

  return { valid: true };
}

function extractRequestedYear(question) {
  const match = String(question || "").match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

const CUTOFF_CATEGORY_ORDER = ["OC", "BCM", "BC", "MBC", "SCA", "SC", "ST"];
const CUTOFF_CATEGORY_SET = new Set(CUTOFF_CATEGORY_ORDER);

function extractRequestedCategory(question) {
  const normalized = String(question || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  if (!normalized) return null;

  if (/\bOPEN CATEGORY\b|\bGENERAL CATEGORY\b/.test(normalized)) return "OC";
  if (/\bBACKWARD CLASS MUSLIM\b/.test(normalized)) return "BCM";

  const tokens = normalized.split(/\s+/);
  for (const category of CUTOFF_CATEGORY_ORDER) {
    if (tokens.includes(category)) return category;
  }
  return null;
}

function extractRequestedMetric(question) {
  const normalized = String(question || "").toLowerCase();
  const asksMax = /\b(max|maximum|highest|top)\b/.test(normalized);
  const asksMin = /\b(min|minimum|lowest|least)\b/.test(normalized);
  if (asksMax && !asksMin) return "max";
  if (asksMin && !asksMax) return "min";
  return null;
}

function normalizeDepartmentName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getDepartmentAliases(entry) {
  const department = String(entry?.department || "").trim();
  const code = String(entry?.code || "").trim();
  const normalizedCode = normalizeDepartmentName(code);
  const aliases = new Set([
    normalizeDepartmentName(department),
    normalizedCode,
  ]);

  if (normalizedCode === "aml") {
    aliases.add("aiml");
    aliases.add("ai ml");
    aliases.add("ai and ml");
    aliases.add("artificial intelligence machine learning");
  }

  if (normalizedCode === "ads") {
    aliases.add("aids");
    aliases.add("ai ds");
    aliases.add("ai and ds");
    aliases.add("ai data science");
  }

  if (normalizedCode === "mech") {
    aliases.add("mechanical");
  }

  return [...aliases].filter(Boolean);
}

function findRequestedDepartment(question, departments) {
  const q = normalizeDepartmentName(question);
  if (!q) return null;
  const tokens = q.split(" ");

  for (const entry of departments) {
    const aliases = getDepartmentAliases(entry);
    const matched = aliases.some((alias) => {
      if (!alias) return false;
      return q.includes(alias) || tokens.includes(alias);
    });
    if (matched) {
      return entry;
    }
  }

  return null;
}

function parseCutoffQueryIntent(question, departments) {
  const department = findRequestedDepartment(question, departments);
  const requestedCategory = extractRequestedCategory(question);
  const requestedYear = extractRequestedYear(question);
  const requestedMetric = extractRequestedMetric(question);
  const isCategorySpecified = requestedCategory !== null;

  return {
    department,
    requestedCategory: isCategorySpecified ? requestedCategory : "ALL",
    requestedMetric,
    isCategorySpecified,
    requestedYear,
  };
}

function formatCutoffValue(value) {
  return value === null || value === undefined ? "Not available" : String(value);
}

function withOfficialWebsiteNote(answer, question) {
  const content = String(answer || "").trim();
  return sanitizeAssistantIdentity(content);
}

function sanitizeAssistantIdentity(text) {
  const content = String(text || "").trim();
  if (!content) return content;

  const normalized = content.toLowerCase();
  if (
    normalized.includes("provided data lists available seats") ||
    normalized.includes("does not contain information about") ||
    normalized.includes("not available in the provided data") ||
    normalized.includes("i couldn't find relevant information")
  ) {
    return buildLiveAgentAndWebsiteMessage();
  }

  return content
    .replace(/i am a large language model,\s*trained by google\.?/gi, "AIML Team")
    .replace(/i am a large language model trained by google\.?/gi, "AIML Team");
}

function buildDepartmentCutoffAnswer({
  year,
  department,
  yearEntry,
  requestedCategory,
  requestedMetric,
  isCategorySpecified,
}) {
  const cutoff = yearEntry?.cutoff && typeof yearEntry.cutoff === "object" ? yearEntry.cutoff : {};
  const availableCategories = CUTOFF_CATEGORY_ORDER.filter((category) => category in cutoff);
  if (!availableCategories.length) {
    return `${year} Cutoff information for ${department.department} is not available right now.`;
  }

  if (isCategorySpecified) {
    if (!CUTOFF_CATEGORY_SET.has(requestedCategory)) {
      return "Please specify a valid category (OC, BC, BCM, MBC, SCA, SC, ST).";
    }

    const values = cutoff[requestedCategory];
    if (!values || typeof values !== "object") {
      if (requestedMetric === "max") {
        return `${year} Cutoff - ${department.department} (${requestedCategory})\n\nMax: Not available`;
      }
      if (requestedMetric === "min") {
        return `${year} Cutoff - ${department.department} (${requestedCategory})\n\nMin: Not available`;
      }
      return `${year} Cutoff - ${department.department} (${requestedCategory})\n\nMax: Not available\nMin: Not available`;
    }

    if (requestedMetric === "max") {
      return `${year} Cutoff - ${department.department} (${requestedCategory})\n\nMax: ${formatCutoffValue(values.max)}`;
    }
    if (requestedMetric === "min") {
      return `${year} Cutoff - ${department.department} (${requestedCategory})\n\nMin: ${formatCutoffValue(values.min)}`;
    }

    return [
      `${year} Cutoff - ${department.department} (${requestedCategory})`,
      "",
      `Max: ${formatCutoffValue(values.max)}`,
      `Min: ${formatCutoffValue(values.min)}`,
    ].join("\n");
  }

  if (requestedMetric) {
    const numericCandidates = availableCategories
      .map((category) => {
        const values = cutoff[category];
        if (!values || typeof values !== "object") return null;
        const metricValue = values[requestedMetric];
        if (metricValue === null || metricValue === undefined) return null;
        if (!Number.isFinite(Number(metricValue))) return null;
        return {
          category,
          value: Number(metricValue),
        };
      })
      .filter(Boolean);

    if (!numericCandidates.length) {
      const metricLabel = requestedMetric === "max" ? "Max" : "Min";
      return `${year} Cutoff - ${department.department}\n\n${metricLabel}: Not available`;
    }

    const chosen =
      requestedMetric === "max"
        ? numericCandidates.reduce((best, current) => (current.value > best.value ? current : best))
        : numericCandidates.reduce((best, current) => (current.value < best.value ? current : best));

    const metricLabel = requestedMetric === "max" ? "Max" : "Min";
    return [
      `${year} Cutoff - ${department.department}`,
      "",
      `${metricLabel}: ${chosen.value}`,
      `Category: ${chosen.category}`,
    ].join("\n");
  }

  const lines = [`${year} Cutoff - ${department.department}`];
  for (const category of availableCategories) {
    const values = cutoff[category];
    if (!values || typeof values !== "object") {
      lines.push(`${category}: Max Not available, Min Not available`);
      continue;
    }
    lines.push(`${category}: Max ${formatCutoffValue(values.max)}, Min ${formatCutoffValue(values.min)}`);
  }
  return lines.join("\n");
}
async function readStructuredCutoffDataset(dataDirs) {
  for (const dataDir of dataDirs) {
    try {
      const entries = await fs.readdir(dataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue;
        const fullPath = path.join(dataDir, entry.name);
        const content = await fs.readFile(fullPath, "utf8");
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.cutoff_data)) {
          return {
            source: path.relative(process.cwd(), fullPath),
            parsed,
          };
        }
      }
    } catch {
      // Try next directory candidate.
    }
  }

  return null;
}

async function readFaqTextDataset(dataDirs) {
  for (const dataDir of dataDirs) {
    try {
      const entries = await fs.readdir(dataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (![".txt", ".md"].includes(ext)) continue;

        const fullPath = path.join(dataDir, entry.name);
        const content = await fs.readFile(fullPath, "utf8");
        if (!/admissions faq|eligibility|required documents|fee structure|courses/i.test(content)) {
          continue;
        }
        return {
          source: path.relative(process.cwd(), fullPath),
          content,
        };
      }
    } catch {
      // Try next data directory candidate.
    }
  }
  return null;
}

async function readCollegeProfileDataset(dataDirs) {
  for (const dataDir of dataDirs) {
    try {
      const entries = await fs.readdir(dataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (![".txt", ".md"].includes(ext)) continue;

        const fullPath = path.join(dataDir, entry.name);
        const content = await fs.readFile(fullPath, "utf8");
        const isProfileFile =
          /sona[_\s-]*college[_\s-]*profile/i.test(entry.name) ||
          /sona college of technology \(autonomous\)/i.test(content);
        if (!isProfileFile) continue;

        return {
          source: path.relative(process.cwd(), fullPath),
          content,
        };
      }
    } catch {
      // Try next directory candidate.
    }
  }
  return null;
}

function parseMarkdownSections(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const sections = [];
  let current = { title: "Overview", lines: [] };

  for (const raw of lines) {
    const line = raw.trim();
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (current.lines.length) sections.push(current);
      current = { title: headingMatch[1].trim(), lines: [] };
      continue;
    }
    if (!line) continue;
    current.lines.push(line);
  }

  if (current.lines.length) sections.push(current);
  return sections;
}

function pickProfileSections(question, sections) {
  const q = String(question || "").toLowerCase();
  if (!q) return sections.slice(0, 3);

  const keywordMap = [
    { section: "Admission", regex: /\badmission|eligibility|apply|entrance|tancet|gate|mat\b/ },
    { section: "Rankings", regex: /\branking|nirf|rank\b/ },
    { section: "Facilities", regex: /\bfacilit|campus|library|hostel|apple lab\b/ },
    { section: "Industry Tie-ups", regex: /\bindustry|tie[-\s]?up|oracle|ibm|infosys|wipro|cisco\b/ },
    { section: "R&D Centers", regex: /\br&d|rd|research|centre|center of excellence\b/ },
  ];

  const requested = keywordMap.filter((item) => item.regex.test(q)).map((item) => item.section);
  if (!requested.length) {
    return sections.filter((s) => ["Overview", "Admission", "Rankings", "Facilities"].includes(s.title)).slice(0, 4);
  }

  return sections.filter((section) => requested.some((name) => section.title.startsWith(name)));
}

async function buildCollegeProfileResponse(question, dataDirs) {
  if (!isCollegeProfileQuestion(question)) return null;

  const profile = await readCollegeProfileDataset(dataDirs);
  if (!profile?.content) return null;

  const sections = parseMarkdownSections(profile.content);
  if (!sections.length) {
    return {
      answer: profile.content.trim(),
      source: profile.source,
    };
  }

  const selectedSections = pickProfileSections(question, sections);
  const limitedSections = selectedSections.length ? selectedSections : sections.slice(0, 4);
  const blocks = limitedSections
    .map((section) => `## ${section.title}\n${section.lines.join("\n")}`)
    .join("\n\n");

  return {
    answer: blocks,
    source: profile.source,
  };
}

function extractFaqBullet(content, sectionTitle, matcher) {
  const text = String(content || "");
  const sectionPattern = new RegExp(`${sectionTitle}\\s*\\n([\\s\\S]*?)(?:\\n\\s*\\n|$)`, "i");
  const sectionMatch = text.match(sectionPattern);
  const sectionBody = sectionMatch ? sectionMatch[1] : text;
  const lines = sectionBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => matcher.test(line)) || null;
}

async function buildFaqIntentResponse(question, dataDirs) {
  const intent = classifyFaqIntent(question);
  if (!intent) return null;

  const faq = await readFaqTextDataset(dataDirs);
  if (!faq?.content) return null;

  const feeTuition = extractFaqBullet(faq.content, "Fee Structure", /tuition fee/i);
  const feeHostel = extractFaqBullet(faq.content, "Fee Structure", /hostel fee/i);
  const feeLabExam = extractFaqBullet(faq.content, "Fee Structure", /lab|exam fee/i);
  const eligibility = extractFaqBullet(faq.content, "Admissions FAQ", /eligibility/i);
  const documents = extractFaqBullet(faq.content, "Admissions FAQ", /required documents/i);
  const deadline = extractFaqBullet(faq.content, "Admissions FAQ", /counseling|counselling|june|august|last date|starts|closes/i);

  const courseLines = String(faq.content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s*[A-Za-z].*:\s*/.test(line) && /(years?|includes)/i.test(line))
    .map((line) => line.replace(/^-+\s*/, ""));

  const normalizeLine = (line) => String(line || "").replace(/^-+\s*/, "").trim();

  if (intent === "eligibility") {
    return {
      answer: eligibility
        ? `## Admission Eligibility\n- ${normalizeLine(eligibility)}`
        : "Eligibility details are not available right now. Please check the official website.",
      source: faq.source,
    };
  }

  if (intent === "documents") {
    return {
      answer: documents
        ? `## Required Documents\n- ${normalizeLine(documents)}`
        : "Required documents details are not available right now. Please check the official website.",
      source: faq.source,
    };
  }

  if (intent === "deadline") {
    return {
      answer: deadline
        ? `## Admission Timeline\n- ${normalizeLine(deadline)}`
        : "Admission timeline details are not available right now. Please check the official website.",
      source: faq.source,
    };
  }

  if (intent === "hostel_fee") {
    return {
      answer: feeHostel
        ? `## Hostel Fee\n- ${normalizeLine(feeHostel)}`
        : "Hostel fee details are not available right now. Please check the official website.",
      source: faq.source,
    };
  }

  if (intent === "tuition_fee") {
    return {
      answer: feeTuition
        ? `## Tuition Fee\n- ${normalizeLine(feeTuition)}`
        : "Tuition fee details are not available right now. Please check the official website.",
      source: faq.source,
    };
  }

  if (intent === "lab_exam_fee") {
    return {
      answer: feeLabExam
        ? `## Lab and Exam Fee\n- ${normalizeLine(feeLabExam)}`
        : "Lab and exam fee details are not available right now. Please check the official website.",
      source: faq.source,
    };
  }

  if (intent === "fees") {
    const lines = [];
    if (feeTuition) lines.push(`- ${normalizeLine(feeTuition)}`);
    if (feeHostel) lines.push(`- ${normalizeLine(feeHostel)}`);
    if (feeLabExam) lines.push(`- ${normalizeLine(feeLabExam)}`);
    return {
      answer: lines.length
        ? `## Fee Structure\n${lines.join("\n")}`
        : "Fee details are not available right now. Please check the official website.",
      source: faq.source,
    };
  }

  if (intent === "courses") {
    return {
      answer: courseLines.length
        ? `## Courses\n${courseLines.map((line) => `- ${line}`).join("\n")}`
        : "Course details are not available right now. Please check the official website.",
      source: faq.source,
    };
  }

  return null;
}

async function buildStructuredCutoffResponse(question, dataDirs) {
  if (!isCutoffQuestion(question)) return null;

  const dataset = await readStructuredCutoffDataset(dataDirs);
  if (!dataset?.parsed) return null;

  const departments = Array.isArray(dataset.parsed.cutoff_data) ? dataset.parsed.cutoff_data : [];
  if (!departments.length) return null;

  const intent = parseCutoffQueryIntent(question, departments);
  const requestedYear =
    intent.requestedYear ||
    Math.max(
      ...departments.flatMap((department) =>
        (Array.isArray(department?.years) ? department.years : [])
          .map((entry) => Number(entry?.year))
          .filter(Number.isFinite)
      )
    );

  if (!Number.isFinite(requestedYear)) return null;

  if (!intent.department) {
    return {
      answer: "Please specify department and category (e.g., IT OC, CSE BC).",
      source: dataset.source,
    };
  }

  const yearEntry = (Array.isArray(intent.department.years) ? intent.department.years : []).find(
    (item) => Number(item?.year) === Number(requestedYear)
  );
  if (!yearEntry) {
    return {
      answer: `Cutoff details for ${intent.department.department} in ${requestedYear} are not available right now.`,
      source: dataset.source,
    };
  }

  return {
    answer: buildDepartmentCutoffAnswer({
      year: requestedYear,
      department: intent.department,
      yearEntry,
      requestedCategory: intent.requestedCategory,
      requestedMetric: intent.requestedMetric,
      isCategorySpecified: intent.isCategorySpecified,
    }),
    source: dataset.source,
  };
}

async function buildGeneralCollegeOverviewResponse(question, dataDirs) {
  if (!isGeneralCollegeOverviewQuestion(question)) return null;

  const dataset = await readStructuredCutoffDataset(dataDirs);
  if (!dataset?.parsed) return null;

  const collegeName = String(dataset.parsed.college || "Sona College of Technology").trim();
  const departments = Array.isArray(dataset.parsed.cutoff_data) ? dataset.parsed.cutoff_data : [];
  if (!departments.length) return null;

  const latestYear = Math.max(
    ...departments.flatMap((department) =>
      (Array.isArray(department?.years) ? department.years : [])
        .map((entry) => Number(entry?.year))
        .filter(Number.isFinite)
    )
  );

  const overviewRows = departments
    .map((department) => {
      const years = Array.isArray(department?.years) ? department.years : [];
      const latestEntry = years
        .filter((entry) => Number.isFinite(Number(entry?.year)))
        .sort((a, b) => Number(b.year) - Number(a.year))[0];

      const seats = latestEntry?.available_seats ?? "NA";
      const oc = latestEntry?.cutoff?.OC;
      const ocRange =
        oc && typeof oc === "object"
          ? `${formatCutoffValue(oc.max)} / ${formatCutoffValue(oc.min)}`
          : "Not available";

      return {
        department: String(department.department || "NA"),
        code: String(department.code || "NA"),
        seats,
        ocRange,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const profileLines = [
    `## ${collegeName} - College Overview`,
    `- Programs listed in current knowledge base: **${overviewRows.length}**`,
    Number.isFinite(latestYear)
      ? `- Latest available academic snapshot year: **${latestYear}**`
      : "- Latest academic snapshot year: **Not available**",
    "- You can ask department-specific questions on cutoffs, admissions, eligibility, and courses.",
    "",
    "### Programs Snapshot",
    "| Department | Code | Latest Seats | Latest OC Cutoff (Max / Min) |",
    "| --- | --- | ---: | --- |",
  ];

  for (const row of overviewRows) {
    profileLines.push(`| ${row.department} | ${row.code} | ${row.seats} | ${row.ocRange} |`);
  }

  profileLines.push("");
  profileLines.push(
    'Ask a specific query for precise help, for example: "IT OC cutoff", "CSE admission eligibility", or "ECE cutoff 2025".'
  );

  return {
    answer: profileLines.join("\n"),
    source: dataset.source,
  };
}

class RAGService {
  constructor() {
    this.vectorStore = createVectorStore(createEmbeddings());
    this.gemini = new GeminiService({
      apiKey: env.googleApiKey,
      model: env.geminiModel,
      timeoutMs: env.geminiTimeoutMs,
    });
    this.claude = new ClaudeService({
      apiKey: env.anthropicApiKey,
      model: env.claudeModel,
    }); // fallback
    this.ready = false;
    this.lastDatasetDir = null;
  }

  async loadChunks() {
    const uniqueDataDirs = [...new Set(getCandidateDataDirs())];

    for (const dataDir of uniqueDataDirs) {
      try {
        await fs.access(dataDir);
        const chunksFromDir = await loadChunksFromDirectory(dataDir);
        if (chunksFromDir.length) {
          this.lastDatasetDir = path.resolve(dataDir);
          return chunksFromDir;
        }
      } catch {
        // Try next available dataset directory.
      }
    }

    try {
      const file = await fs.readFile(env.chunksStorePath, "utf8");
      const parsed = JSON.parse(file);
      if (Array.isArray(parsed?.chunks) && parsed.chunks.length) {
        this.lastDatasetDir = null;
        return parsed.chunks;
      }
    } catch {
      // No persisted chunks available.
    }

    return [];
  }

  getStatus() {
    const llmProvider = env.googleApiKey
      ? "gemini"
      : env.anthropicApiKey
        ? "claude"
        : "retrieval-only";

    return {
      provider: env.vectorDbProvider,
      initialized: this.ready,
      llmProvider,
      llmModel:
        llmProvider === "gemini"
          ? env.geminiModel
          : llmProvider === "claude"
            ? env.claudeModel
            : "none",
      llmConfigured: Boolean(env.googleApiKey || env.anthropicApiKey),
      datasetDir: this.lastDatasetDir,
    };
  }

  async ensurePineconeSeeded(chunks) {
    if (!chunks.length) return;

    const bootstrapResults = await this.vectorStore.similaritySearch(
      "college admission cutoff fees eligibility",
      1
    );

    if (bootstrapResults.length > 0) return;

    console.log("Pinecone index appears empty. Seeding from local dataset chunks...");
    await this.vectorStore.buildFromChunks(chunks);
  }

  async init() {
    if (this.ready) return;

    const chunks = await this.loadChunks();

    try {
      if (env.vectorDbProvider === "pinecone") {
        if (!this.vectorStore.pineconeIntegratedEmbedding) {
          await this.vectorStore.initPineconeStore();
        }
        await this.ensurePineconeSeeded(chunks);
      } else {
        await this.vectorStore.buildFromChunks(chunks);
      }
    } catch (error) {
      console.warn("Falling back to local vector store:", error.message);
      const { LangChainVectorStore } = await import("./vectorStore.js");
      this.vectorStore = new LangChainVectorStore(createEmbeddings(), {
        provider: "local",
      });
      await this.vectorStore.buildFromChunks(chunks);
    }
    this.ready = true;
  }

  async reindex() {
    const chunks = await this.loadChunks();

    if (env.vectorDbProvider === "pinecone") {
      await this.vectorStore.buildFromChunks(chunks);
      this.ready = true;
      return { provider: "pinecone", chunkCount: chunks.length, dataDir: this.lastDatasetDir };
    }

    await this.vectorStore.buildFromChunks(chunks);
    this.ready = true;
    return { provider: "local", chunkCount: chunks.length, dataDir: this.lastDatasetDir };
  }

  async ask(question, options = {}) {
    await this.init();
    const settings = await getRuntimeSettings();
    const supplementalContext = String(options?.supplementalContext || "").trim();
    const sessionId = options.sessionId;
    const previousMessages = options.previousMessages || []; // Array of {sender, content}
    const uniqueDataDirs = [...new Set(getCandidateDataDirs())];

    // Chat history context for memory
    const historyContext = previousMessages.slice(-6).map(msg => `${msg.sender}: ${msg.content}`).join('\\n');
    if (historyContext) {
      console.log(`Chat memory (${previousMessages.length} msgs):`, historyContext.substring(0, 200) + '...');
    }

    if (isGreetingOrSmallTalk(question)) {
      return {
        answer: "Hi! How can I assist you today?",
        confidence: 1,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    if (isPrincipalQuestion(question)) {
      return {
        answer: withOfficialWebsiteNote(buildPrincipalResponse(), question),
        confidence: 1,
        sources: ["configured-college-profile"],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    if (isChairmanQuestion(question)) {
      return {
        answer: buildChairmanResponse(),
        confidence: 1,
        sources: ["configured-college-profile"],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    if (isWebsiteQuestion(question)) {
      return {
        answer: `Official website: ${OFFICIAL_WEBSITE_URL}`,
        confidence: 1,
        sources: ["configured-college-profile"],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    const validation = validateUserQuery(question);
    if (!validation.valid) {
      return {
        answer: validation.message,
        confidence: 0,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    const structuredCutoffResponse = await buildStructuredCutoffResponse(question, uniqueDataDirs);
    if (structuredCutoffResponse) {
      return {
        answer: withOfficialWebsiteNote(structuredCutoffResponse.answer, question),
        confidence: 1,
        sources: [structuredCutoffResponse.source],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    const faqIntentResponse = await buildFaqIntentResponse(question, uniqueDataDirs);
    if (faqIntentResponse) {
      return {
        answer: withOfficialWebsiteNote(faqIntentResponse.answer, question),
        confidence: 1,
        sources: [faqIntentResponse.source],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    if (isRestrictedFeeQuestion(question)) {
      return {
        answer: withOfficialWebsiteNote(
          "Fee details are not available in this chatbot right now. Please use the official website or connect to a live agent for fee-related help.",
          question
        ),
        confidence: 1,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    const collegeProfileResponse = await buildCollegeProfileResponse(question, uniqueDataDirs);
    if (collegeProfileResponse) {
      return {
        answer: withOfficialWebsiteNote(collegeProfileResponse.answer, question),
        confidence: 1,
        sources: [collegeProfileResponse.source],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    const generalCollegeOverview = await buildGeneralCollegeOverviewResponse(question, uniqueDataDirs);
    if (generalCollegeOverview) {
      return {
        answer: withOfficialWebsiteNote(generalCollegeOverview.answer, question),
        confidence: 1,
        sources: [generalCollegeOverview.source],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    const results = await this.vectorStore.similaritySearch(question, settings.ragTopK);
    const topScores = results.map((item) => normalizeScore(item.score));
    const averageScore = topScores.length
      ? topScores.reduce((a, b) => a + b, 0) / topScores.length
      : 0;
    const bestScore = topScores.length ? Math.max(...topScores) : 0;
    let confidence = topScores.length
      ? bestScore * 0.7 + averageScore * 0.3
      : 0;

    const contextChunks = results.map((item) => ({
      source: item.source,
      text: item.text,
      score: item.score,
    }));

    if (supplementalContext) {
      contextChunks.unshift({
        source: "embedded-site-context",
        text: supplementalContext,
        score: 1,
      });
      if (!results.length) {
        confidence = Math.max(confidence, settings.ragConfidenceThreshold + 0.05);
      }
    }

    const modelAnswer = await this.gemini.answer({ 
      question, 
      contextChunks,
      allowGeneral: true,
    });

    console.log('Gemini raw response:', {content: modelAnswer.content.substring(0,100), confidence: modelAnswer.confidence, needsAgent: modelAnswer.needsAgent});

    if (modelAnswer.needsAgent) {
      return {
        answer: sanitizeAssistantIdentity(modelAnswer.content),
        confidence: 0,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
        needsAgent: true
      };
    }

    const relevanceScore = modelAnswer.confidence;
    if (relevanceScore < settings.ragConfidenceThreshold) {
      return {
        answer: buildLiveAgentAndWebsiteMessage(),
        confidence: relevanceScore,
        sources: contextChunks.slice(0, 3).map((chunk) => chunk.source),
        escalationSuggested: true,
        outOfScope: relevanceScore < settings.ragOutOfScopeThreshold,
        needsAgent: true,
      };
    }

    return {
      answer: sanitizeAssistantIdentity(modelAnswer.content),
      confidence: relevanceScore,
      sources: contextChunks.slice(0, 3).map((chunk) => chunk.source),
      escalationSuggested: false,
      outOfScope: relevanceScore < settings.ragOutOfScopeThreshold,
    };
  }
}

export const ragService = new RAGService();
