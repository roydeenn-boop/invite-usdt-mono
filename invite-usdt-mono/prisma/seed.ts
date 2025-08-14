
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const pass = process.env.ADMIN_PASSWORD || "change_me_admin_password";

  const hashed = await bcrypt.hash(pass, 10);

  let admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, password: hashed, role: "admin", status: "ACTIVE" }
  })

  // one default invite for testing
  await prisma.invite.upsert({
    where: { code: "TEST-INVITE-123" },
    update: {},
    create: { code: "TEST-INVITE-123", createdBy: admin.id }
  })

  console.log("Seeded admin:", email);
  console.log("Invite code: TEST-INVITE-123");
}

main().finally(async ()=> prisma.$disconnect());
