import { API_BASE_URL } from '../api';

/**
 * Utility to resolve profile image URLs correctly.
 * Ensures the path doesn't include redundant prefixes and adds a cache-busting timestamp.
 */
export const getProfileImageUrl = (profileImage?: string | null, timestamp?: string | number): string | undefined => {
  if (!profileImage) return undefined;
  
  // 1. If it's already an absolute URL (contains ://)
  const trimmedPath = profileImage.trim();
  if (trimmedPath.includes('://')) {
    if (!timestamp) return trimmedPath;
    const separator = trimmedPath.includes('?') ? '&' : '?';
    return `${trimmedPath}${separator}v=${timestamp}`;
  }

  // 2. Resolve base URL (strictly follow production URL for images as requested)
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isProduction = import.meta.env.PROD || window.location.hostname === 'timesheet.asaind.co.in';
  const cleanApiUrl = isLocalhost
    ? window.location.origin
    : (isProduction ? 'https://timesheet.asaind.co.in' : (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/api\/?.*$/, '').replace(/\/$/, ''));
  
  // 3. Ensure the path starts with /uploads/profile/ if it doesn't already
  let cleanPath = trimmedPath.replace(/^\/+/, '');
  if (!cleanPath.startsWith('uploads/')) {
    cleanPath = `uploads/${cleanPath}`;
  }
  
  const finalUrl = `${cleanApiUrl}/${cleanPath}`;
  return timestamp ? `${finalUrl}?v=${timestamp}` : finalUrl;
};

/**
 * Legacy support for resolveAssetUrl
 */
export const resolveAssetUrl = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  
  const trimmedPath = path.trim();
  if (trimmedPath.includes('://')) return trimmedPath;

  const cleanApiUrl = window.location.origin;
  let cleanPath = trimmedPath.replace(/^\/+/, '');
  if (!cleanPath.startsWith('uploads/')) {
    cleanPath = `uploads/${cleanPath}`;
  }
  return `${cleanApiUrl}/${cleanPath}`;
};
