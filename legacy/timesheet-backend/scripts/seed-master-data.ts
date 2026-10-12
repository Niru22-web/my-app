
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
  try {
    console.log('🌱 Seeding Projects and Jobs...');

    // 1. Get or Create Clients
    const clientNames = [
      'Alkem Laboratories Ltd',
      'Ashish Shah and Associates',
      'NVK, NVK/CSI'
    ];

    const clients = [];
    for (const name of clientNames) {
      let client = await prisma.client.findFirst({ where: { name } });
      if (!client) {
        client = await prisma.client.create({
          data: {
            name,
            clientId: `CLI-${name.substring(0, 3).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
            alias: name.substring(0, 5),
            gstStatus: 'No',
            pan: 'ABCDE1234F',
            createdBy: 'System'
          }
        });
        console.log(`✅ Created Client: ${name}`);
      }
      clients.push(client);
    }

    // 2. Create Projects for each client
    for (const client of clients) {
      const projectName = `${client.name} - Implementation`;
      let project = await prisma.project.findFirst({ where: { name: projectName } });
      if (!project) {
        project = await prisma.project.create({
          data: {
            name: projectName,
            projectId: `PRJ-${client.name.substring(0, 3).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
            status: 'Active',
            startDate: new Date(),
            billable: true,
            clientId: client.id
          }
        });
        console.log(`✅ Created Project: ${projectName}`);
      }

      // 3. Create Jobs for each project
      const jobNames = ['On-site Visit', 'Documentation', 'General Expenses'];
      for (const jobName of jobNames) {
        const combinedId = `${project.projectId}-${jobName.substring(0, 3).toUpperCase()}`;
        let job = await prisma.job.findFirst({ where: { combinedId } });
        if (!job) {
          await prisma.job.create({
            data: {
              name: jobName,
              jobId: `JOB-${Math.floor(Math.random() * 10000)}`,
              status: 'Active',
              billable: true,
              projectId: project.id,
              combinedId
            }
          });
          console.log(`   ✅ Created Job: ${jobName}`);
        }
      }
    }

    console.log('🎉 Seeding completed!');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
