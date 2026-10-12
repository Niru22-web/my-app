import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function migrateDocuments() {
  console.log('🚀 Starting Document Path Migration...');
  
  const documents = await prisma.employeeDocument.findMany();
  console.log(`📊 Found ${documents.length} records to process.`);
  
  const uploadsBase = path.join(process.cwd(), 'uploads');
  const documentsDir = path.join(uploadsBase, 'documents');
  const profileDir = path.join(uploadsBase, 'profile');
  
  if (!fs.existsSync(documentsDir)) {
    fs.mkdirSync(documentsDir, { recursive: true });
  }

  let migratedCount = 0;
  let missingCount = 0;

  for (const doc of documents) {
    const fileName = doc.fileName;
    const possiblePaths = [
      path.join(documentsDir, fileName),
      path.join(uploadsBase, fileName),
      path.join(profileDir, fileName),
      path.join(process.cwd(), '..', 'uploads', 'documents', fileName),
      path.join(process.cwd(), '..', 'uploads', fileName),
      path.join(process.cwd(), '..', 'uploads', 'profile', fileName),
      path.join(process.cwd(), doc.filePath || ''),
      path.resolve(doc.filePath || '')
    ];

    let sourcePath = '';
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        sourcePath = p;
        break;
      }
    }

    if (sourcePath) {
      const destinationPath = path.join(documentsDir, fileName);
      
      // Move file if not already in documents folder
      if (sourcePath !== destinationPath) {
        try {
          fs.copyFileSync(sourcePath, destinationPath);
          console.log(`✅ Moved: ${fileName} to uploads/documents/`);
        } catch (err) {
          console.error(`❌ Failed to copy ${fileName}:`, err);
        }
      }

      // Normalize DB path
      const normalizedPath = path.join('uploads', 'documents', fileName);
      if (doc.filePath !== normalizedPath) {
        await prisma.employeeDocument.update({
          where: { id: doc.id },
          data: { filePath: normalizedPath }
        });
        migratedCount++;
      }
    } else {
      console.warn(`⚠️  File not found anywhere on server: ${fileName}`);
      missingCount++;
    }
  }

  console.log('\n--- MIGRATION SUMMARY ---');
  console.log(`✅ Normalized: ${migratedCount} records`);
  console.log(`⚠️  Missing files: ${missingCount}`);
  console.log('🏁 Migration Complete.');
}

migrateDocuments()
  .catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
