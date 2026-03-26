import { Router } from "express";
import { StudentUser } from "../models/StudentUser.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { requireStudentAuth, signStudentToken } from "../middleware/studentAuth.js";
import { ChatSession } from "../models/ChatSession.js";
import { env, isProd } from "../config/env.js";
import { sendOtp } from "../services/otpDeliveryService.js";
import { OAuth2Client } from "google-auth-library";
import { getRuntimeSettings } from "../services/adminSettingsService.js";

const router = Router();

const OTP_TTL_MS = env.otpTtlMinutes * 60 * 1000;
const MAX_OTP_ATTEMPTS = env.otpMaxAttempts;
const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMobile(value) {
  return String(value || "").replace(/\D/g, "").trim();
}

function formatMobileForDelivery(value) {
  const normalized = normalizeMobile(value);
  if (!normalized) return "";
  if (normalized.startsWith("91") && normalized.length === 12) {
    return `+${normalized}`;
  }
  if (normalized.length === 10) {
    return `+91${normalized}`;
  }
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

function buildOtpPayload(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    mobile: user.mobile || "",
  };
}

function buildStudentLoginPayload(user) {
  const token = signStudentToken({
    role: "student",
    studentId: String(user._id),
    email: user.email,
    name: user.name,
  });

  return {
    token,
    user: buildOtpPayload(user),
  };
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getDebugOtp(otp) {
  if (isProd) return undefined;
  return env.otpDebugExpose ? otp : undefined;
}

function resolveOtpDestination({ preferredChannel = "mobile", email = "", mobile = "" }) {
  const normalizedPreferred = String(preferredChannel || "mobile").trim().toLowerCase();
  const normalizedEmail = normalizeEmail(email);
  const normalizedMobile = normalizeMobile(mobile);

  if (normalizedPreferred === "email" && normalizedEmail) {
    return {
      channel: "email",
      target: normalizedEmail,
      deliveryTarget: normalizedEmail,
    };
  }

  if (normalizedMobile) {
    return {
      channel: "mobile",
      target: normalizedMobile,
      deliveryTarget: formatMobileForDelivery(normalizedMobile),
    };
  }

  if (normalizedEmail) {
    return {
      channel: "email",
      target: normalizedEmail,
      deliveryTarget: normalizedEmail,
    };
  }

  throw new Error("Unable to resolve OTP destination");
}

async function setUserOtp({ user, channel, target }) {
  const otp = generateOtp();
  user.otpCodeHash = hashPassword(otp);
  user.otpChannel = channel;
  user.otpTarget = target;
  user.otpRequestedAt = new Date();
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.otpAttempts = 0;
  await user.save();
  return otp;
}

async function issueAndDeliverOtp({ user, channel, target, deliveryTarget }) {
  const preferredChannel = channel;
  const preferredTarget = target;
  const preferredDeliveryTarget = deliveryTarget;

  const otp = await setUserOtp({
    user,
    channel: preferredChannel,
    target: preferredTarget,
  });

  try {
    const delivery = await sendOtp({
      channel: preferredChannel,
      target: preferredDeliveryTarget,
      otp,
      studentName: user.name,
    });

    return {
      channel: preferredChannel,
      target: preferredTarget,
      otp: getDebugOtp(otp),
      delivered: Boolean(delivery?.delivered),
    };
  } catch (error) {
    const canFallbackToMobile =
      preferredChannel === "email" &&
      Boolean(normalizeMobile(user.mobile));

    if (!canFallbackToMobile) {
      throw error;
    }

    const fallbackMobile = normalizeMobile(user.mobile);
    const fallbackDeliveryTarget = formatMobileForDelivery(fallbackMobile);

    // Rebind OTP target metadata to the mobile destination for correct verification.
    user.otpChannel = "mobile";
    user.otpTarget = fallbackMobile;
    await user.save();

    const fallbackDelivery = await sendOtp({
      channel: "mobile",
      target: fallbackDeliveryTarget,
      otp,
      studentName: user.name,
    });

    return {
      channel: "mobile",
      target: fallbackMobile,
      otp: getDebugOtp(otp),
      delivered: Boolean(fallbackDelivery?.delivered),
    };
  }
}

router.post("/register", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const mobile = normalizeMobile(req.body?.mobile);

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "name, email and password are required" });
    }
    if (mobile && mobile.length < 10) {
      return res.status(400).json({ success: false, message: "Please enter a valid mobile number" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const exists = await StudentUser.findOne({ email }).lean();
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    if (mobile) {
      const mobileExists = await StudentUser.findOne({ mobile }).lean();
      if (mobileExists) {
        return res.status(409).json({ success: false, message: "Mobile number already registered" });
      }
    }

    const user = await StudentUser.create({
      name,
      email,
      mobile: mobile || undefined,
      passwordHash: hashPassword(password),
    });

    return res.status(201).json({
      success: true,
      data: buildStudentLoginPayload(user),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "email and password are required" });
    }

    const user = await StudentUser.findOne({ email });
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    return res.json({
      success: true,
      data: buildStudentLoginPayload(user),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/signup", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const mobile = normalizeMobile(req.body?.mobile);
    const password = String(req.body?.password || "").trim();

    if (!name || !email || !mobile) {
      return res.status(400).json({ success: false, message: "name, email and mobile are required" });
    }
    if (mobile.length < 10) {
      return res.status(400).json({ success: false, message: "Please enter a valid mobile number" });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const runtimeSettings = await getRuntimeSettings();
    const preferredChannel = runtimeSettings?.otpPreferredChannel || env.otpPreferredChannel || "mobile";
    const destination = resolveOtpDestination({
      preferredChannel,
      email,
      mobile,
    });

    const emailMatch = await StudentUser.findOne({ email });
    const mobileMatch = await StudentUser.findOne({ mobile });

    if (emailMatch && mobileMatch && String(emailMatch._id) !== String(mobileMatch._id)) {
      return res.status(409).json({ success: false, message: "Email and mobile belong to different users" });
    }

    if (emailMatch && !mobileMatch) {
      emailMatch.mobile = mobile;
      emailMatch.name = name;
      if (password) {
        emailMatch.passwordHash = hashPassword(password);
      }
      const otpPayload = await issueAndDeliverOtp({
        user: emailMatch,
        channel: destination.channel,
        target: destination.target,
        deliveryTarget: destination.deliveryTarget,
      });
      return res.json({
        success: true,
        message: `Signup complete. OTP sent to ${otpPayload.channel}.`,
        data: {
          ...otpPayload,
          user: buildOtpPayload(emailMatch),
        },
      });
    }

    if (mobileMatch && !emailMatch) {
      mobileMatch.email = email;
      mobileMatch.name = name;
      if (password) {
        mobileMatch.passwordHash = hashPassword(password);
      }
      const otpPayload = await issueAndDeliverOtp({
        user: mobileMatch,
        channel: destination.channel,
        target: destination.target,
        deliveryTarget: destination.deliveryTarget,
      });
      return res.json({
        success: true,
        message: `Signup complete. OTP sent to ${otpPayload.channel}.`,
        data: {
          ...otpPayload,
          user: buildOtpPayload(mobileMatch),
        },
      });
    }

    if (emailMatch && mobileMatch) {
      emailMatch.name = name;
      if (password) {
        emailMatch.passwordHash = hashPassword(password);
      }
      const otpPayload = await issueAndDeliverOtp({
        user: emailMatch,
        channel: destination.channel,
        target: destination.target,
        deliveryTarget: destination.deliveryTarget,
      });
      return res.json({
        success: true,
        message: `Profile exists. OTP sent to ${otpPayload.channel}.`,
        data: {
          ...otpPayload,
          user: buildOtpPayload(emailMatch),
        },
      });
    }

    const user = await StudentUser.create({
      name,
      email,
      mobile,
      passwordHash: password ? hashPassword(password) : "",
    });
    const otpPayload = await issueAndDeliverOtp({
      user,
      channel: destination.channel,
      target: destination.target,
      deliveryTarget: destination.deliveryTarget,
    });
    return res.status(201).json({
      success: true,
      message: `Signup complete. OTP sent to ${otpPayload.channel}.`,
      data: {
        ...otpPayload,
        user: buildOtpPayload(user),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/otp/request", async (req, res, next) => {
  try {
    const runtimeSettings = await getRuntimeSettings();
    const fallbackChannel = runtimeSettings?.otpPreferredChannel || env.otpPreferredChannel || "mobile";
    const channel = String(req.body?.channel || fallbackChannel).trim().toLowerCase();
    if (channel !== "email" && channel !== "mobile") {
      return res.status(400).json({ success: false, message: "channel must be email or mobile" });
    }

    const email = normalizeEmail(req.body?.email);
    const mobile = normalizeMobile(req.body?.mobile);
    const query = channel === "email" ? { email } : { mobile };
    const target = channel === "email" ? email : mobile;
    const deliveryTarget = channel === "email" ? email : formatMobileForDelivery(mobile);

    if (!target) {
      return res.status(400).json({ success: false, message: `${channel} is required` });
    }

    const user = await StudentUser.findOne(query);
    if (!user) {
      return res.status(404).json({ success: false, message: "Student not found. Please sign up first." });
    }

    const otpPayload = await issueAndDeliverOtp({
      user,
      channel,
      target,
      deliveryTarget,
    });

    return res.json({
      success: true,
      message: `OTP sent to your ${channel}`,
      data: {
        ...otpPayload,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/otp/verify", async (req, res, next) => {
  try {
    const channel = String(req.body?.channel || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    const email = normalizeEmail(req.body?.email);
    const mobile = normalizeMobile(req.body?.mobile);
    const query = channel === "email" ? { email } : { mobile };
    const target = channel === "email" ? email : mobile;

    if ((channel !== "email" && channel !== "mobile") || !target || !otp) {
      return res.status(400).json({ success: false, message: "channel, target, and otp are required" });
    }

    const user = await StudentUser.findOne(query);
    if (!user) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    if (!user.otpCodeHash || !user.otpExpiresAt) {
      return res.status(400).json({ success: false, message: "No OTP requested. Please request OTP first." });
    }
    if (user.otpChannel !== channel || user.otpTarget !== target) {
      return res.status(400).json({ success: false, message: "OTP channel or destination mismatch" });
    }
    if (Date.now() > new Date(user.otpExpiresAt).getTime()) {
      return res.status(400).json({ success: false, message: "OTP expired. Request a new OTP." });
    }
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ success: false, message: "Too many attempts. Request a new OTP." });
    }

    const valid = verifyPassword(otp, user.otpCodeHash);
    if (!valid) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(401).json({ success: false, message: "Invalid OTP" });
    }

    user.otpCodeHash = "";
    user.otpChannel = "";
    user.otpTarget = "";
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    user.lastLoginAt = new Date();
    await user.save();

    return res.json({
      success: true,
      message: "OTP verified",
      data: buildStudentLoginPayload(user),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/password/forgot/request", async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    if (!mobile) {
      return res.status(400).json({ success: false, message: "mobile is required" });
    }

    const user = await StudentUser.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const otpPayload = await issueAndDeliverOtp({
      user,
      channel: "mobile",
      target: mobile,
      deliveryTarget: formatMobileForDelivery(mobile),
    });

    return res.json({
      success: true,
      message: "OTP sent to your mobile",
      data: otpPayload,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/password/forgot/verify", async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const otp = String(req.body?.otp || "").trim();
    const newPassword = String(req.body?.newPassword || "").trim();

    if (!mobile || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "mobile, otp, and newPassword are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const user = await StudentUser.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    if (!user.otpCodeHash || !user.otpExpiresAt) {
      return res.status(400).json({ success: false, message: "No OTP requested. Please request OTP first." });
    }
    if (user.otpChannel !== "mobile" || user.otpTarget !== mobile) {
      return res.status(400).json({ success: false, message: "OTP channel or destination mismatch" });
    }
    if (Date.now() > new Date(user.otpExpiresAt).getTime()) {
      return res.status(400).json({ success: false, message: "OTP expired. Request a new OTP." });
    }
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ success: false, message: "Too many attempts. Request a new OTP." });
    }

    const valid = verifyPassword(otp, user.otpCodeHash);
    if (!valid) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(401).json({ success: false, message: "Invalid OTP" });
    }

    user.passwordHash = hashPassword(newPassword);
    user.otpCodeHash = "";
    user.otpChannel = "";
    user.otpTarget = "";
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await user.save();

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login/google", async (req, res, next) => {
  try {
    if (!googleClient) {
      return res.status(503).json({ success: false, message: "Google login is not configured" });
    }

    const credential = String(req.body?.credential || "").trim();
    if (!credential) {
      return res.status(400).json({ success: false, message: "credential is required" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    });

    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);
    const name = String(payload?.name || payload?.given_name || "Student").trim();

    if (!email || !payload?.email_verified) {
      return res.status(401).json({ success: false, message: "Unable to verify Google account email" });
    }

    let user = await StudentUser.findOne({ email });
    if (!user) {
      user = await StudentUser.create({
        name: name || "Student",
        email,
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    return res.json({
      success: true,
      message: "Google login successful",
      data: buildStudentLoginPayload(user),
    });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("token")) {
      return res.status(401).json({ success: false, message: "Invalid Google credential" });
    }
    return next(error);
  }
});

router.get("/me", requireStudentAuth, (req, res) => {
  return res.json({
    success: true,
    data: {
      id: req.student.studentId,
      name: req.student.name || "Student",
      email: req.student.email || "",
    },
  });
});

router.get("/history", requireStudentAuth, async (req, res, next) => {
  try {
    const sessions = await ChatSession.find({ studentId: req.student.studentId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    return res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

export default router;
