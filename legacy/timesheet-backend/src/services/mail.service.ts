import nodemailer from "nodemailer";
import { sendEmail } from "./email.service";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.IT_EMAIL || "your-email@gmail.com",
    pass: process.env.IT_EMAIL_PASSWORD || "your-app-password"
  }
});

export const sendITEmail = async ({ to, subject, html }: { to: string, subject: string, html: string }) => {
  try {
    // 1. Try to send via the central email service (which uses Outlook OAuth or configured SMTP)
    const success = await sendEmail({ to, subject, html }).catch(() => false);
    if (success) {
      console.log(`✅ Email sent to ${to} via central email service`);
      return;
    }

    // 2. Fallback to Gmail SMTP using IT_EMAIL / IT_EMAIL_PASSWORD if configured and not placeholder values
    const user = process.env.IT_EMAIL || "";
    const pass = process.env.IT_EMAIL_PASSWORD || "";
    const isPlaceholder = user === "your-email@gmail.com" || pass === "your-app-password" || !user || !pass;

    if (!isPlaceholder) {
      console.log(`🔄 Central email service failed/unconfigured. Falling back to Gmail SMTP for ${to}...`);
      await transporter.sendMail({
        from: `IT Support <${user}>`,
        to,
        subject,
        html
      });
      console.log(`✅ Email sent to ${to} via Gmail SMTP fallback`);
    } else {
      console.warn(`⚠️ No email provider configured (no active Outlook/Gmail connection) and Gmail SMTP credentials are placeholder values. Email to ${to} was not sent.`);
    }
  } catch (error) {
    console.error("❌ Failed to send email:", error);
  }
};
