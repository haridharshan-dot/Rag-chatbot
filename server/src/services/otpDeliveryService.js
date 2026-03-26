import nodemailer from "nodemailer";
import twilio from "twilio";
import { env, isProd } from "../config/env.js";

let cachedMailer = null;
let cachedTwilioClient = null;

function getMailerTransporter() {
  if (cachedMailer) return cachedMailer;
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !env.smtpFrom) {
    return null;
  }

  cachedMailer = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
  return cachedMailer;
}

function getTwilioClient() {
  if (cachedTwilioClient) return cachedTwilioClient;
  if (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioFromNumber) {
    return null;
  }

  cachedTwilioClient = twilio(env.twilioAccountSid, env.twilioAuthToken);
  return cachedTwilioClient;
}

export function isEmailOtpConfigured() {
  return Boolean(getMailerTransporter());
}

export function isSmsOtpConfigured() {
  return Boolean(getTwilioClient());
}

export async function checkOtpProviderHealth() {
  const emailConfigured = isEmailOtpConfigured();
  const smsConfigured = isSmsOtpConfigured();

  const email = {
    provider: "smtp",
    configured: emailConfigured,
    ready: false,
    status: emailConfigured ? "checking" : "not_configured",
    message: emailConfigured ? "Checking SMTP connectivity..." : "SMTP is not configured",
  };

  const sms = {
    provider: "twilio",
    configured: smsConfigured,
    ready: false,
    status: smsConfigured ? "checking" : "not_configured",
    message: smsConfigured ? "Checking Twilio connectivity..." : "Twilio is not configured",
  };

  if (emailConfigured) {
    try {
      const transporter = getMailerTransporter();
      await transporter.verify();
      email.ready = true;
      email.status = "ready";
      email.message = "SMTP connection verified";
    } catch (error) {
      email.status = "error";
      email.message = error?.message || "SMTP verification failed";
    }
  }

  if (smsConfigured) {
    try {
      const client = getTwilioClient();
      await client.api.accounts(env.twilioAccountSid).fetch();
      sms.ready = true;
      sms.status = "ready";
      sms.message = "Twilio credentials verified";
    } catch (error) {
      sms.status = "error";
      sms.message = error?.message || "Twilio verification failed";
    }
  }

  const overallReady = email.ready || sms.ready;
  return {
    checkedAt: new Date().toISOString(),
    overallReady,
    email,
    sms,
  };
}

export async function sendOtp({ channel, target, otp, studentName = "Student" }) {
  if (channel === "email") {
    const transporter = getMailerTransporter();
    if (!transporter) {
      if (!isProd) {
        console.warn("SMTP not configured, skipping email OTP delivery in non-production mode.");
        return { delivered: false, reason: "smtp_not_configured" };
      }
      throw new Error("SMTP is not configured for email OTP delivery");
    }

    await transporter.sendMail({
      from: env.smtpFrom,
      to: target,
      subject: "Your Sona AI Assistant OTP",
      text: `Hi ${studentName}, your OTP is ${otp}. It expires in ${env.otpTtlMinutes} minutes.`,
      html: `<p>Hi ${studentName},</p><p>Your OTP is <strong>${otp}</strong>.</p><p>It expires in ${env.otpTtlMinutes} minutes.</p>`,
    });
    return { delivered: true };
  }

  if (channel === "mobile") {
    const client = getTwilioClient();
    if (!client) {
      if (!isProd) {
        console.warn("Twilio not configured, skipping SMS OTP delivery in non-production mode.");
        return { delivered: false, reason: "twilio_not_configured" };
      }
      throw new Error("Twilio is not configured for mobile OTP delivery");
    }

    await client.messages.create({
      body: `Sona AI Assistant OTP: ${otp}. Valid for ${env.otpTtlMinutes} min.`,
      from: env.twilioFromNumber,
      to: target,
    });
    return { delivered: true };
  }

  throw new Error("Unsupported OTP channel");
}
