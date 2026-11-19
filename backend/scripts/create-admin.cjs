#!/usr/bin/env node
// Creates (or re-activates) the first Admin account in an empty database, e.g. a fresh cloud database.
//
//   ADMIN_EMAIL=you@asaind.co.in ADMIN_PASSWORD='a long password' node scripts/create-admin.cjs [First] [Last]
//
// The password comes from the environment, never the command line, so it isn't saved in shell history.
// Reads DATABASE_URL from the environment (or backend/.env). If the email already exists, the account is made
// an active, approved Admin and its password is reset — nothing else about it changes.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
const [firstName = "Portal", lastName = "Admin"] = process.argv.slice(2);

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Set ADMIN_EMAIL to the admin's office email address.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Set ADMIN_PASSWORD to at least 12 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash(password, 10);
  const access = { role: "Admin", status: "Active", approvalStatus: "APPROVED", isApproved: true, approvedAt: new Date(), password: hash };
  const existing = await prisma.employee.findFirst({ where: { officeEmail: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (existing) {
    await prisma.employee.update({ where: { id: existing.id }, data: access });
    console.log(`Updated ${email}: active Admin, password reset.`);
  } else {
    const count = await prisma.employee.count();
    await prisma.employee.create({
      data: {
        employeeId: `ADM${String(count + 1).padStart(3, "0")}`,
        firstName,
        lastName,
        officeEmail: email,
        designation: "Administrator",
        department: "Administration",
        ...access,
      },
    });
    console.log(`Created ${email} as an active Admin. Sign in, then invite everyone else from Management → Employees.`);
  }
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
