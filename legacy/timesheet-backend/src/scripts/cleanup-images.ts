import { prisma } from "../config/prisma";

async function main() {
  console.log("Cleanup script disabled - old image fields removed from schema");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
