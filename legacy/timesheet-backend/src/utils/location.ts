import axios from 'axios';

// Simple in-memory cache to avoid duplicate API calls for the same location
const locationCache: Record<string, string> = {};

/**
 * Fetches the nearest building or landmark name using Google Places API.
 * Falls back to reverse geocoding (address) if no specific place is found.
 * 
 * @param lat Latitude
 * @param lng Longitude
 * @returns Building name, address, or coordinates as fallback
 */
export async function getLocationName(lat: number | string, lng: number | string): Promise<string> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('⚠️ GOOGLE_MAPS_API_KEY is missing in environment variables');
    return `${lat}, ${lng}`;
  }

  // Cache by lat/lng rounded to 4 decimal places (~11m precision)
  const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
  const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng;
  const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)}`;

  if (locationCache[cacheKey]) {
    console.log(`📍 Using cached location for ${cacheKey}: ${locationCache[cacheKey]}`);
    return locationCache[cacheKey];
  }

  try {
    // 🔥 Step 1: Try Nearby Place (Building Name)
    // Radius = 50 meters as requested
    const placeUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latNum},${lngNum}&radius=50&key=${apiKey}`;
    const placeRes = await axios.get(placeUrl);
    const placeData = placeRes.data;

    let result = '';

    if (placeData.results && placeData.results.length > 0) {
      result = placeData.results[0].name; // e.g., Hubtown Solaris
    } else {
      // 🔁 Step 2: Fallback to Address
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&key=${apiKey}`;
      const geoRes = await axios.get(geoUrl);
      const geoData = geoRes.data;

      if (geoData.status === "OK" && geoData.results && geoData.results.length > 0) {
        // Return first three parts of address for better detail
        result = geoData.results[0].formatted_address.split(",").slice(0, 3).join(",");
      }
    }

    if (result) {
      locationCache[cacheKey] = result;
      return result;
    }

    // ❌ Final fallback
    return `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`;
  } catch (error) {
    console.error('Error fetching location name:', error);
    return `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`;
  }
}
