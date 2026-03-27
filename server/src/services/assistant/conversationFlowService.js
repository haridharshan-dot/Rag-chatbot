const OFFICIAL_WEBSITE_URL = "https://www.sonatech.ac.in/";
const DEFAULT_SUGGESTIONS = ["Check cutoff", "View fees", "Talk to agent"];
const CATEGORIES = new Set(["OC", "BC", "BCM", "MBC", "SC", "SCA", "ST"]);
const BRANCHES = [
  "CSE",
  "IT",
  "ECE",
  "EEE",
  "MECH",
  "CIVIL",
  "AIML",
  "AIDS",
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCutoff(text) {
  const match = String(text || "").match(/\b(\d{2,3}(?:\.\d+)?)\b/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 200) return null;
  return value;
}

function parseCategory(text) {
  const upper = String(text || "").toUpperCase();
  for (const value of CATEGORIES) {
    if (new RegExp(`\\b${value}\\b`).test(upper)) return value;
  }
  return null;
}

function parseBranch(text) {
  const upper = String(text || "").toUpperCase();
  if (/\bAI\s*ML\b|\bAIML\b|\bAML\b/.test(upper)) return "AIML";
  if (/\bAI\s*DS\b|\bAIDS\b|\bADS\b/.test(upper)) return "AIDS";
  for (const branch of BRANCHES) {
    if (new RegExp(`\\b${branch}\\b`).test(upper)) return branch;
  }
  return null;
}

function parseStream(text) {
  const value = normalize(text);
  if (/\bpcm\b/.test(value)) return "PCM";
  if (/\b(commerce|arts|bio|biology|medical)\b/.test(value)) return "NON_PCM";
  return null;
}

function detectIntent(text) {
  const value = normalize(text);
  if (!value) return "unknown";
  if (/\b(alert|notification|deadline|date|counselling|counseling)\b/.test(value)) return "notifications";
  if (/\b(eligibility|eligible|can i apply|am i eligible)\b/.test(value)) return "eligibility";
  if (/\b(recommend|suggest|best course|best branch|admission chance|my options)\b/.test(value)) return "recommendation";
  if (/\b(admission process|application process|how to apply|required documents|document checklist)\b/.test(value)) return "application_guidance";
  if (/\b(live agent|talk to agent|speak to agent|admission office|talk to someone|human agent)\b/.test(value)) return "agent_request";
  if (/\b(website|link|url|official site)\b/.test(value)) return "website";
  return "general";
}

function extractProfileFromInput(text) {
  return {
    cutoffMarks: parseCutoff(text),
    category: parseCategory(text),
    preferredBranch: parseBranch(text),
    stream: parseStream(text),
  };
}

function chanceLabel(cutoff, branch) {
  const top = new Set(["CSE", "IT", "AIML"]);
  const core = new Set(["ECE", "EEE", "AIDS"]);
  if (top.has(branch)) {
    if (cutoff >= 185) return "High";
    if (cutoff >= 175) return "Medium";
    return "Low";
  }
  if (core.has(branch)) {
    if (cutoff >= 175) return "High";
    if (cutoff >= 165) return "Medium";
    return "Low";
  }
  if (cutoff >= 165) return "High";
  if (cutoff >= 150) return "Medium";
  return "Low";
}

function buildRecommendationCards(profile) {
  const preferred = profile.preferredBranch || "CSE";
  const fallback = BRANCHES.filter((branch) => branch !== preferred).slice(0, 3);
  const selected = [preferred, ...fallback].slice(0, 4);
  return [
    {
      type: "course_recommendation",
      title: "Recommended Courses",
      items: selected.map((branch) => ({
        branch,
        chance: chanceLabel(Number(profile.cutoffMarks || 0), branch),
      })),
    },
  ];
}

function buildEligibilityResponse(profile) {
  const marks = Number(profile.cutoffMarks || 0);
  const stream = profile.stream || "PCM";
  const warnings = [];
  if (stream !== "PCM") warnings.push("Engineering admissions usually require PCM background.");
  if (marks < 120) warnings.push("Low score range; admission options may be limited.");

  const eligibleCourses =
    marks >= 175
      ? ["CSE", "IT", "AIML", "ECE", "EEE"]
      : marks >= 150
        ? ["ECE", "EEE", "AIDS", "MECH", "CIVIL"]
        : ["MECH", "CIVIL", "EEE"];

  const lines = [
    "Eligibility Check",
    `Marks/Cutoff: ${marks || "Not provided"}`,
    `Stream: ${stream}`,
    `Eligible courses: ${eligibleCourses.join(", ")}`,
  ];
  if (warnings.length) lines.push(`Warning: ${warnings.join(" ")}`);

  return {
    answer: lines.join("\n"),
    cards: [
      {
        type: "eligibility",
        title: "Eligibility Summary",
        items: eligibleCourses.map((course) => ({ label: course })),
        warnings,
      },
    ],
  };
}

function buildGuidanceResponse() {
  return {
    answer: [
      "Admission Guidance",
      "1. Keep marksheet, transfer certificate, ID proof, and passport photo ready.",
      "2. Complete online application and verify details before submission.",
      "3. Track counselling and admission deadlines regularly.",
      `4. For latest official updates, visit: ${OFFICIAL_WEBSITE_URL}`,
    ].join("\n"),
    cards: [
      {
        type: "checklist",
        title: "Required Documents",
        items: ["Marksheet", "Transfer Certificate", "ID Proof", "Passport Photo"],
      },
    ],
  };
}

function buildNotificationsResponse() {
  return {
    answer: [
      "Important Admission Alerts",
      "- Counselling window is currently active.",
      "- Keep your document set ready before final submission.",
      `- Check official updates: ${OFFICIAL_WEBSITE_URL}`,
    ].join("\n"),
    cards: [
      {
        type: "alerts",
        title: "Admission Alerts",
        items: [
          { title: "Counselling updates", date: "Check portal daily" },
          { title: "Application status", date: "Review every 24 hours" },
          { title: "Document verification", date: "Before final submission" },
        ],
      },
    ],
  };
}

function mergeProfile(session, updates) {
  session.studentProfile = {
    ...(session.studentProfile || {}),
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== null && value !== undefined)),
  };
}

function setAssistantState(session, flow, step, lastIntent, context = {}) {
  session.assistantState = {
    ...(session.assistantState || {}),
    flow,
    step,
    lastIntent,
    context: { ...(session.assistantState?.context || {}), ...context },
  };
}

function standardResponse({
  answer,
  intent,
  suggestions = DEFAULT_SUGGESTIONS,
  cards = [],
  confidence = 0.9,
  handled = true,
}) {
  return {
    handled,
    intent,
    answer,
    confidence,
    suggestions,
    cards,
  };
}

function handleRecommendationFlow(session, input) {
  const state = session.assistantState || {};
  const profile = session.studentProfile || {};
  const flow = state.flow === "recommendation" ? state.flow : "recommendation";
  const step = state.step || "cutoff";
  const updates = extractProfileFromInput(input);
  mergeProfile(session, updates);

  const mergedProfile = session.studentProfile || {};
  if (step === "cutoff") {
    if (!Number.isFinite(Number(mergedProfile.cutoffMarks))) {
      setAssistantState(session, flow, "cutoff", "recommendation");
      return standardResponse({
        intent: "recommendation",
        answer: "Please share your cutoff marks first.",
        suggestions: ["My cutoff is 175", "My cutoff is 185", "Talk to agent"],
      });
    }
    setAssistantState(session, flow, "category", "recommendation");
    return standardResponse({
      intent: "recommendation",
      answer: "Got it. Please share your category (OC, BC, BCM, MBC, SC, ST).",
      suggestions: ["OC", "BC", "MBC"],
    });
  }

  if (step === "category") {
    if (!mergedProfile.category) {
      setAssistantState(session, flow, "category", "recommendation");
      return standardResponse({
        intent: "recommendation",
        answer: "Please mention your category (for example: OC, BC, MBC, SC).",
        suggestions: ["OC", "BC", "SC"],
      });
    }
    setAssistantState(session, flow, "branch", "recommendation");
    return standardResponse({
      intent: "recommendation",
      answer: "Thanks. Which branch do you prefer?",
      suggestions: ["CSE", "IT", "ECE"],
    });
  }

  if (step === "branch") {
    if (!mergedProfile.preferredBranch) {
      setAssistantState(session, flow, "branch", "recommendation");
      return standardResponse({
        intent: "recommendation",
        answer: "Please tell your preferred branch (CSE, IT, ECE, EEE, MECH, CIVIL, AIML, AIDS).",
        suggestions: ["CSE", "IT", "AIML"],
      });
    }

    const cards = buildRecommendationCards(mergedProfile);
    const preferredChance = cards[0]?.items?.[0]?.chance || "Medium";
    setAssistantState(session, null, null, "recommendation_completed");
    return standardResponse({
      intent: "recommendation",
      answer: [
        "Personalized Recommendation",
        `Cutoff: ${mergedProfile.cutoffMarks}`,
        `Category: ${mergedProfile.category}`,
        `Preferred branch: ${mergedProfile.preferredBranch}`,
        `Admission chance for preferred branch: ${preferredChance}`,
      ].join("\n"),
      cards,
      suggestions: ["Check cutoff", "View fees", "Talk to agent"],
      confidence: 0.95,
    });
  }

  setAssistantState(session, flow, "cutoff", "recommendation");
  return standardResponse({
    intent: "recommendation",
    answer: "Please share your cutoff marks to start recommendation.",
  });
}

function handleEligibilityFlow(session, input) {
  const state = session.assistantState || {};
  const flow = state.flow === "eligibility" ? state.flow : "eligibility";
  const step = state.step || "marks";
  const updates = extractProfileFromInput(input);
  mergeProfile(session, updates);
  const profile = session.studentProfile || {};

  if (step === "marks") {
    if (!Number.isFinite(Number(profile.cutoffMarks))) {
      setAssistantState(session, flow, "marks", "eligibility");
      return standardResponse({
        intent: "eligibility",
        answer: "Please provide your marks/cutoff for eligibility check.",
        suggestions: ["My cutoff is 160", "My cutoff is 180", "Talk to agent"],
      });
    }
    setAssistantState(session, flow, "stream", "eligibility");
    return standardResponse({
      intent: "eligibility",
      answer: "Please share your stream (PCM or Non-PCM).",
      suggestions: ["PCM", "Non-PCM"],
    });
  }

  if (step === "stream") {
    if (!profile.stream) {
      setAssistantState(session, flow, "stream", "eligibility");
      return standardResponse({
        intent: "eligibility",
        answer: "Please specify stream as PCM or Non-PCM.",
        suggestions: ["PCM", "Non-PCM"],
      });
    }
    const result = buildEligibilityResponse(profile);
    setAssistantState(session, null, null, "eligibility_completed");
    return standardResponse({
      intent: "eligibility",
      answer: result.answer,
      cards: result.cards,
      suggestions: ["Admission process", "Required documents", "Talk to agent"],
      confidence: 0.92,
    });
  }

  setAssistantState(session, flow, "marks", "eligibility");
  return standardResponse({
    intent: "eligibility",
    answer: "Please provide your marks/cutoff to start eligibility check.",
  });
}

export function runConversationFlow(session, userInput) {
  const intent = detectIntent(userInput);
  const activeFlow = session.assistantState?.flow || null;

  if (intent === "website") {
    setAssistantState(session, activeFlow, session.assistantState?.step || null, "website");
    return standardResponse({
      intent,
      answer: `Official website: ${OFFICIAL_WEBSITE_URL}`,
      suggestions: ["Admission process", "Check cutoff", "Talk to agent"],
      confidence: 1,
    });
  }

  if (intent === "agent_request") {
    if (session.status === "active" || session.assignedAgentId) {
      return standardResponse({
        intent,
        answer: "Yes sir, you are in the right place. You are in live agent only. How can I help you?",
        confidence: 1,
        suggestions: ["Ask admission process", "Ask required documents", "Ask fees"],
      });
    }
    if (session.status === "queued") {
      return standardResponse({
        intent,
        answer: "Your live agent request is active. Please wait, an agent will assist you shortly.",
        suggestions: ["Admission process", "Required documents", "Website link"],
        confidence: 1,
      });
    }
    return standardResponse({
      intent,
      answer: "The live agent option is on top. Please activate it and talk to a live agent.",
      suggestions: ["Talk to agent", "Admission process", "Official website"],
      confidence: 1,
    });
  }

  if (intent === "application_guidance") {
    const guidance = buildGuidanceResponse();
    setAssistantState(session, null, null, intent);
    return standardResponse({
      intent,
      answer: guidance.answer,
      cards: guidance.cards,
      suggestions: ["Required documents", "Check deadlines", "Talk to agent"],
      confidence: 0.95,
    });
  }

  if (intent === "notifications") {
    const notifications = buildNotificationsResponse();
    setAssistantState(session, null, null, intent);
    return standardResponse({
      intent,
      answer: notifications.answer,
      cards: notifications.cards,
      suggestions: ["Admission process", "Official website", "Talk to agent"],
      confidence: 0.95,
    });
  }

  if (intent === "recommendation" || activeFlow === "recommendation") {
    return handleRecommendationFlow(session, userInput);
  }

  if (intent === "eligibility" || activeFlow === "eligibility") {
    return handleEligibilityFlow(session, userInput);
  }

  setAssistantState(session, activeFlow, session.assistantState?.step || null, intent);
  return {
    handled: false,
    intent,
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

export function buildFallbackSuggestions(intent = "general") {
  if (intent === "cutoff") return ["Max cutoff for IT", "CSE OC cutoff", "Talk to agent"];
  if (intent === "fees") return ["Tuition fee", "Hostel fee", "Talk to agent"];
  if (intent === "website") return ["Official website", "Admission process", "Talk to agent"];
  return DEFAULT_SUGGESTIONS;
}
