import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { ACCOUNTS_ROLES, authenticate, normRole, revokeSessions, signToken } from "../plugins/auth";
import { clear as clearLimit, hit as hitLimit } from "../utils/rate-limit";

/** Same rule the screens enforce: at least 8 characters with a letter and a number. */
const strongEnough = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
/** One message for unknown email, missing password and wrong password, so login never reveals who has an account. */
const BAD_LOGIN = { success: false, message: "Email or password is incorrect.", errorCode: "INVALID_CREDENTIALS" } as const;
import { parseBodyOrMultipart } from "../utils/uploads";
import { createNotification } from "../utils/notify";

const ALLOWED_LOGIN_ROLES = new Set([
  "admin",
  "owner",
  "hr",
  "it",
  "manager",
  "partner",
  "sub-manager",
  "sub manager",
  "employee",
  "user",
  ...ACCOUNTS_ROLES,
]);

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login — strict bcrypt verification (S3) + full Accounts role support (AC14)
  app.post("/api/auth/login", async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; officeEmail?: string; password?: string };
    const email = (body.email ?? body.officeEmail ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return reply.code(400).send({
        success: false,
        message: "Email and password are required",
        errorCode: "MISSING_CREDENTIALS",
      });
    }

    // 10 failed attempts per account and 30 per network address in 15 minutes, then a cool-down.
    const wait = Math.max(hitLimit(`login:email:${email}`, 10, 15 * 60_000), hitLimit(`login:ip:${req.ip}`, 30, 15 * 60_000));
    if (wait) {
      return reply
        .code(429)
        .header("Retry-After", String(wait))
        .send({ success: false, message: `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, errorCode: "TOO_MANY_ATTEMPTS" });
    }

    const user = await prisma.employee.findFirst({
      where: { officeEmail: { equals: email, mode: "insensitive" } },
    });
    // Unknown email or no password yet → same answer as a wrong password (no account enumeration).
    if (!user?.password || !(await bcrypt.compare(password, user.password))) {
      return reply.code(401).send(BAD_LOGIN);
    }
    clearLimit(`login:email:${email}`);

    const status = (user.status ?? "").toLowerCase();
    if (status === "pending" || user.approvalStatus === "PENDING") {
      return reply.code(403).send({
        success: false,
        message: "Your account is awaiting approval.",
        errorCode: "ACCOUNT_PENDING",
      });
    }
    if (status === "rejected" || user.approvalStatus === "REJECTED") {
      return reply.code(403).send({
        success: false,
        message: "Your registration was declined.",
        errorCode: "ACCOUNT_REJECTED",
      });
    }
    if (status === "inactive" || status === "disabled") {
      return reply.code(403).send({
        success: false,
        message: "Your account is inactive. Please contact HR.",
        errorCode: "ACCOUNT_INACTIVE",
      });
    }

    const role = normRole(user.role);
    if (!ALLOWED_LOGIN_ROLES.has(role)) {
      return reply.code(403).send({
        success: false,
        message: "Role is not permitted to sign in.",
        errorCode: "INVALID_ROLE",
      });
    }

    // (Password was verified above with bcrypt only — never a plaintext fallback.)

    const token = signToken({
      id: user.id,
      employeeId: user.employeeId,
      email: user.officeEmail,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      hasAccountsAccess: user.hasAccountsAccess || ACCOUNTS_ROLES.has(role) || role === "admin",
    });

    return reply.send({
      success: true,
      token,
      user: {
        id: user.id,
        employeeId: user.employeeId,
        name: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.officeEmail,
        role: user.role,
        department: user.department,
        position: user.designation,
        status: user.status,
        profileImage: user.profileImage,
        hasAccountsAccess: user.hasAccountsAccess || ACCOUNTS_ROLES.has(role) || role === "admin",
      },
    });
  });

  // GET /api/auth/me — returns verified current user without password hash
  app.get("/api/auth/me", { preHandler: [authenticate] }, async (req, reply) => {
    const emp = await prisma.employee.findUnique({
      where: { id: req.user!.id },
      select: SAFE_EMPLOYEE_SELECT,
    });
    if (!emp) {
      return reply.code(401).send({ success: false, message: "User not found" });
    }
    return reply.send({
      success: true,
      user: {
        ...emp,
        name: `${emp.firstName} ${emp.lastName}`.trim(),
        email: emp.officeEmail,
        position: emp.designation,
      },
    });
  });

  // POST /api/auth/refresh — issues a fresh JWT so check-in/out never fails with STALE_TOKEN (fixes C3, C7)
  app.post("/api/auth/refresh", { preHandler: [authenticate] }, async (req, reply) => {
    const emp = await prisma.employee.findUnique({
      where: { id: req.user!.id },
      select: SAFE_EMPLOYEE_SELECT,
    });
    if (!emp || (emp.status ?? "").toLowerCase() !== "active") {
      return reply.code(401).send({ success: false, message: "Account is no longer active" });
    }
    const role = normRole(emp.role);
    const token = signToken({
      id: emp.id,
      employeeId: emp.employeeId,
      email: emp.officeEmail,
      firstName: emp.firstName,
      lastName: emp.lastName,
      role: emp.role,
      hasAccountsAccess: emp.hasAccountsAccess || ACCOUNTS_ROLES.has(role) || role === "admin",
    });
    return reply.send({ success: true, token });
  });

  // POST /api/auth/register — blocked publicly (fixes M2)
  app.post("/api/auth/register", async (_req, reply) => {
    return reply.code(403).send({
      success: false,
      message: "Public self-registration is disabled. Staff must be invited by HR.",
    });
  });

  // POST /api/auth/change-password
  app.post("/api/auth/change-password", { preHandler: [authenticate] }, async (req, reply) => {
    const { currentPassword, newPassword } = (req.body ?? {}) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword || !strongEnough(newPassword)) {
      return reply.code(400).send({
        success: false,
        message: "Enter your current password and a new one of at least 8 characters with a letter and a number.",
      });
    }
    const user = await prisma.employee.findUnique({ where: { id: req.user!.id } });
    if (!user?.password || !(await bcrypt.compare(currentPassword, user.password))) {
      return reply.code(400).send({ success: false, message: "Current password is incorrect." });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.employee.update({ where: { id: user.id }, data: { password: hash } });
    // Every existing session ends (including this one) — the browser signs in again with the new password.
    await revokeSessions(user.id, "password changed");
    return reply.send({ success: true, message: "Password updated. Please sign in again." });
  });

  // POST /api/auth/forgot-password
  app.post("/api/auth/forgot-password", async (req, reply) => {
    const { email } = (req.body ?? {}) as { email?: string };
    const cleanEmail = (email ?? "").trim().toLowerCase();
    if (!cleanEmail) {
      return reply.code(400).send({ success: false, message: "Email is required." });
    }
    if (hitLimit(`forgot:${req.ip}`, 10, 60 * 60_000)) {
      return reply.code(429).send({ success: false, message: "Too many requests. Try again later." });
    }

    const emp = await prisma.employee.findFirst({
      where: { officeEmail: { equals: cleanEmail, mode: "insensitive" } },
    });

    if (emp) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      await prisma.passwordReset.deleteMany({ where: { userId: emp.id } });
      await prisma.passwordReset.create({
        // Only a hash is stored; the plain token goes in the emailed link.
        data: {
          userId: emp.id,
          email: emp.officeEmail,
          token: sha256(token),
          expiresAt,
        },
      });
    }

    // Always respond with success to prevent account enumeration
    return reply.send({
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });
  });

  // GET /api/auth/validate-reset-token
  app.get("/api/auth/validate-reset-token", async (req, reply) => {
    const { token } = (req.query ?? {}) as { token?: string };
    if (!token) {
      return reply.code(400).send({ success: false, valid: false, message: "Reset token is required" });
    }
    const reset = await prisma.passwordReset.findFirst({
      where: { token: sha256(token), expiresAt: { gt: new Date() } },
    });
    if (!reset) {
      return reply.code(400).send({ success: false, valid: false, message: "Reset token is invalid or expired" });
    }
    // Masked, so a leaked link doesn't reveal the full address.
    const [local, domain] = reset.email.split("@");
    return reply.send({ success: true, valid: true, email: `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}` });
  });

  // POST /api/auth/reset-password
  app.post("/api/auth/reset-password", async (req, reply) => {
    const { token, newPassword } = (req.body ?? {}) as { token?: string; newPassword?: string };
    if (!token || !newPassword || !strongEnough(newPassword)) {
      return reply.code(400).send({
        success: false,
        message: "Use a password of at least 8 characters with a letter and a number.",
      });
    }
    const reset = await prisma.passwordReset.findFirst({
      where: { token: sha256(token), expiresAt: { gt: new Date() } },
    });
    if (!reset) {
      return reply.code(400).send({ success: false, message: "Reset link is invalid or has expired." });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.employee.update({
      where: { id: reset.userId },
      data: { password: hash },
    });
    await prisma.passwordReset.deleteMany({ where: { userId: reset.userId } });
    await revokeSessions(reset.userId, "password reset");
    return reply.send({ success: true, message: "Password updated successfully." });
  });

  // GET /api/auth/validate-registration-token
  app.get("/api/auth/validate-registration-token", async (req, reply) => {
    const { token } = (req.query ?? {}) as { token?: string };
    if (!token) {
      return reply.code(400).send({ valid: false, reason: "missing", message: "Missing registration token" });
    }
    const reg = await prisma.registrationToken.findUnique({
      where: { token },
      include: { employee: { select: SAFE_EMPLOYEE_SELECT } },
    });
    if (!reg || !reg.employee) {
      return reply.code(404).send({ valid: false, reason: "not_found", message: "Invalid registration token" });
    }
    if (reg.isUsed) {
      return reply.code(400).send({ valid: false, reason: "used", message: "Registration link already used" });
    }
    if (reg.expiresAt < new Date()) {
      return reply.code(400).send({ valid: false, reason: "expired", message: "Registration link has expired" });
    }

    return reply.send({
      valid: true,
      email: reg.employee.officeEmail,
      firstName: reg.employee.firstName,
      lastName: reg.employee.lastName,
      employeeId: reg.employee.employeeId,
    });
  });

  // POST /api/auth/complete-registration — fixes RG2 (profileImage saved to /uploads/profile)
  app.post("/api/auth/complete-registration", async (req, reply) => {
    // The invite token travels in the URL so it can be checked before any file is written to disk.
    const urlToken = String(((req.query ?? {}) as { token?: string }).token ?? "").trim();
    if (hitLimit(`register:${req.ip}`, 20, 60 * 60_000)) {
      return reply.code(429).send({ success: false, message: "Too many attempts. Try again later." });
    }
    const pre = urlToken ? await prisma.registrationToken.findUnique({ where: { token: urlToken }, include: { employee: { select: { status: true } } } }) : null;
    if (!pre || pre.isUsed || pre.expiresAt < new Date() || (pre.employee?.status ?? "").toLowerCase() !== "invited") {
      return reply.code(400).send({ success: false, message: "This invitation link isn’t valid any more. Ask HR for a new one." });
    }
    let parsed;
    try {
      parsed = await parseBodyOrMultipart(req, "documents", {
        profileImage: "profile",
        profilePhoto: "profile",
      });
    } catch (err) {
      return reply.code(400).send({
        success: false,
        message: err instanceof Error ? err.message : "Invalid file upload",
      });
    }

    const { fields, files } = parsed;
    const token = urlToken;
    const password = fields.password ?? "";

    if (!strongEnough(password)) {
      return reply.code(400).send({ success: false, message: "Use a password of at least 8 characters with a letter and a number." });
    }
    if (!fields.dob || Number.isNaN(new Date(fields.dob).getTime())) {
      return reply.code(400).send({ success: false, message: "Date of birth is required." });
    }

    const reg = await prisma.registrationToken.findUnique({
      where: { token },
      include: { employee: true },
    });

    if (!reg || !reg.employee) {
      return reply.code(404).send({ success: false, message: "Invitation link is not valid." });
    }
    if (reg.isUsed) {
      return reply.code(400).send({ success: false, message: "This invitation link has already been used." });
    }
    if (reg.expiresAt < new Date()) {
      return reply.code(400).send({ success: false, message: "This invitation link has expired." });
    }

    const photoFile = files.find((f) => f.fieldName === "profileImage" || f.fieldName === "profilePhoto");
    const panFile = files.find((f) => f.fieldName === "panFile");
    const aadhaarFile = files.find((f) => f.fieldName === "aadhaarFile");
    const bankFile = files.find((f) => f.fieldName === "bankStatementFile");

    const hash = await bcrypt.hash(password, 10);
    const dob = new Date(String(fields.dob).slice(0, 10) + "T00:00:00.000Z");
    const doj = fields.doj ? new Date(fields.doj) : new Date();

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: reg.employeeId },
        data: {
          password: hash,
          status: "Pending",
          approvalStatus: "PENDING",
          ...(photoFile ? { profileImage: photoFile.filePath } : {}),
        },
      });

      const profData = {
        dob,
        doj,
        gender: fields.gender ?? null,
        maritalStatus: fields.maritalStatus ?? null,
        education: fields.education ?? null,
        personalEmail: fields.personalEmail ?? null,
        personalMobile: fields.personalMobile ?? null,
        currentAddress: fields.currentAddress ?? null,
        currentPinCode: fields.currentPinCode ?? null,
        permanentAddress: fields.permanentAddress ?? null,
        guardianName: fields.guardianName ?? null,
        guardianNumber: fields.guardianNumber ?? null,
        guardianAddress: fields.guardianAddress ?? null,
        pan: fields.pan ? fields.pan.toUpperCase() : null,
        aadhaar: fields.aadhaar ?? null,
        bankName: fields.bankName ?? null,
        accountHolderName: fields.accountHolderName ?? null,
        bankAccountNumber: fields.bankAccountNumber ?? null,
        ifscCode: fields.ifscCode ? fields.ifscCode.toUpperCase() : null,
        branchName: fields.branchName ?? null,
        ...(photoFile ? { profileImage: photoFile.filePath } : {}),
        ...(panFile ? { panFileUrl: panFile.filePath } : {}),
        ...(aadhaarFile ? { aadhaarFileUrl: aadhaarFile.filePath } : {}),
        ...(bankFile ? { bankStatementFileUrl: bankFile.filePath } : {}),
      };

      await tx.employeeProfile.upsert({
        where: { employeeId: reg.employeeId },
        create: { employeeId: reg.employeeId, ...profData },
        update: profData,
      });

      for (const doc of [
        panFile && { ...panFile, title: "PAN Card", category: "Identity" },
        aadhaarFile && { ...aadhaarFile, title: "Aadhaar Card", category: "Identity" },
        bankFile && { ...bankFile, title: "Bank Statement / Cheque", category: "Bank" },
      ]) {
        if (!doc) continue;
        await tx.employeeDocument.create({
          data: {
            employeeId: reg.employeeId,
            title: doc.title,
            category: doc.category,
            fileName: doc.fileName,
            filePath: doc.filePath,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            uploadedBy: reg.employeeId,
          },
        });
      }

      await tx.registrationToken.update({
        where: { id: reg.id },
        data: { isUsed: true },
      });
    });

    // Notify Admins / HR
    const approvers = await prisma.employee.findMany({
      where: {
        status: { equals: "Active", mode: "insensitive" },
        role: { in: ["Admin", "HR", "Owner", "admin", "hr", "owner"] },
      },
      select: { id: true },
    });
    for (const a of approvers) {
      await createNotification({
        userId: a.id,
        title: "New Employee Registration",
        message: `${reg.employee.firstName} ${reg.employee.lastName} (${reg.employee.employeeId}) has completed registration and is awaiting approval.`,
        type: "employee_approval",
        module: "HR",
        priority: "High",
        relatedId: reg.employeeId,
        actionUrl: "/management/employees",
      });
    }

    return reply.send({
      success: true,
      message: "Registration completed and sent for approval.",
    });
  });
}
