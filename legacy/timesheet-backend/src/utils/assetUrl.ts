import { Request } from "express";
import path from "path";

export const getUploadsDir = (): string => {
  if (process.env.UPLOADS_PATH) return process.env.UPLOADS_PATH;
  if (process.platform === 'win32') {
    return path.join(process.cwd(), "uploads");
  }
  return process.env.NODE_ENV === 'production'
    ? "/home/ubuntu/timesheet-app/timesheet-backend/uploads"
    : path.join(process.cwd(), "uploads");
};

const ensureLeadingSlash = (value: string): string => value.startsWith("/") ? value : `/${value}`;

export const toAbsoluteAssetUrl = (assetPath?: string | null, req?: Request): string | null => {
  if (!assetPath) return null;
  
  // If it's already a full URL, return it
  if (/^https?:\/\//i.test(assetPath)) return assetPath;

  // 1. Clean the path by removing leading slashes and common legacy prefixes
  let cleanPath = assetPath.trim()
    .replace(/^\/+/, '')           // Remove leading slashes
    .replace(/^api\//, '')         // Remove legacy 'api/' prefix
    .replace(/^uploads\//, '')     // Remove 'uploads/' if it's there twice
    .replace(/^\/+/, '');          // Clean up any remaining leading slashes

  // 2. Ensure it starts with /uploads/
  const normalizedPath = `/uploads/${cleanPath}`;

  // Log the path for debugging as requested
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 Normalized Image Path: ${assetPath} -> ${normalizedPath}`);
  }

  return normalizedPath;
};

export const normalizeProfileAssetUrls = <T extends Record<string, any>>(profile: T | null | undefined, req?: Request): T | null | undefined => {
  if (!profile) return profile;

  return {
    ...profile,
    profileImage: toAbsoluteAssetUrl(profile.profileImage, req),
    panFileUrl: toAbsoluteAssetUrl(profile.panFileUrl, req),
    aadhaarFileUrl: toAbsoluteAssetUrl(profile.aadhaarFileUrl, req),
    bankStatementFileUrl: toAbsoluteAssetUrl(profile.bankStatementFileUrl, req),
  };
};
