import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function getLocationName(lat: number, lng: number): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ GOOGLE_MAPS_API_KEY is missing');
    return null;
  }

  try {
    const res = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
    );

    const data = res.data;

    if (data.status === "OK" && data.results && data.results.length > 0) {
      // Return first three parts of address for better detail as per recommended improvement
      return data.results[0].formatted_address.split(",").slice(0, 3).join(",");
    }
  } catch (error) {
    console.error('Error in reverse geocoding:', error);
  }

  return null;
}

async function backfill() {
  console.log('🚀 Starting location backfill...');
  
  // 1. Fix attendance table
  const logs = await prisma.attendance.findMany({
    where: {
      OR: [
        { location_name: null },
        { location_name: { contains: ',' } } // Check if it's coordinates (simple heuristic)
      ]
    }
  });

  console.log(`🔍 Found ${logs.length} attendance records to process.`);

  for (const log of logs) {
    if (log.latitude && log.longitude) {
      // If location_name looks like coordinates (e.g. "19.1150, 72.8495") or is null
      const isCoordinates = log.location_name && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(log.location_name);
      
      if (!log.location_name || isCoordinates) {
        console.log(`📍 Backfilling for record ${log.id} (${log.latitude}, ${log.longitude})...`);
        const name = await getLocationName(log.latitude, log.longitude);
        
        if (name) {
          await prisma.attendance.update({
            where: { id: log.id },
            data: { 
              location_name: name,
              check_in_location: name // Also update this to be consistent
            }
          });
          console.log(`✅ Updated: ${name}`);
        }
      }
    }
  }

  // 2. Fix attendance_sessions table
  const sessions = await prisma.attendance_sessions.findMany({
    where: {
      location_name: null
    }
  });

  console.log(`🔍 Found ${sessions.length} session records to process.`);

  for (const session of sessions) {
    if (session.latitude && session.longitude) {
      console.log(`📍 Backfilling session ${session.id}...`);
      const name = await getLocationName(session.latitude, session.longitude);
      
      if (name) {
        await prisma.attendance_sessions.update({
          where: { id: session.id },
          data: { 
            location_name: name,
            check_in_location: name
          }
        });
        console.log(`✅ Updated session: ${name}`);
      }
    }
  }

  console.log('✨ Backfill complete!');
}

backfill()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
