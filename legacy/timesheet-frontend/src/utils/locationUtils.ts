/**
 * Utility to get current geolocation data
 */
export interface LocationData {
    latitude: number | null;
    longitude: number | null;
    address: string;
}

/**
 * Utility to format a location object into a clean, readable string.
 * Handles building, street, area, city, and state.
 */
export const formatLocation = (loc: any): string => {
  if (!loc) return "Location not available";
  
  // If it's already a string, return it (e.g. coordinates or manual name)
  if (typeof loc === 'string') return loc;

  const parts = [
    loc.building,
    loc.street,
    loc.area,
    loc.city,
    loc.state,
    loc.country
  ];

  // Filter out null, undefined, or empty strings and join with commas
  const formatted = parts.filter(p => p && String(p).trim() !== '').join(", ");
  
  return formatted.trim() || (loc.latitude && loc.longitude ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : "Location not available");
};

export const getDetailedLocation = (): Promise<LocationData> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: null, longitude: null, address: 'Geolocation not supported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            if (data && data.address) {
                const a = data.address;
                const city = a.city || a.town || a.village || a.county || "";
                const state = a.state || "";
                const suburb = a.suburb || a.neighbourhood || a.road || "";
                
                // Use formatLocation logic or local clean join
                const parts = [suburb, city, state].filter(Boolean);
                if (parts.length > 0) {
                    address = parts.join(", ");
                }
            }
        } catch (e) {
            console.warn("Reverse geocoding failed", e);
        }

        resolve({ latitude, longitude, address });
      },
      (error) => {
        console.warn('Geolocation error:', error);
        let userMessage = "Unable to fetch location.";

        if (error.code === 1) {
          userMessage = "Location access denied. Please enable GPS and allow location access.";
        } else if (error.code === 2) {
          userMessage = "Location information is unavailable.";
        } else if (error.code === 3) {
          userMessage = "Location request timed out.";
        }
        
        resolve({ latitude: null, longitude: null, address: userMessage });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
};

export const getCurrentLocation = (): Promise<string> => {
  return getDetailedLocation().then(data => data.address);
};

