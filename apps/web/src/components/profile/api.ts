"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/types";

interface Ref {
  id: string;
  name: string;
  employeeCode: string;
}

export interface EmployeeDetails {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
  designation: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
  createdAt: string;
  profileImage: string | null;
  managers: Ref[];
  partners: Ref[];
  subManagers: Ref[];
  profile: {
    dob: string | null;
    doj: string | null;
    education: string | null;
    maritalStatus: string | null;
    gender: string | null;
    permanentAddress: string | null;
    currentAddress: string | null;
    currentPinCode: string | null;
    pan: string | null;
    aadhaar: string | null;
    personalEmail: string | null;
    personalMobile: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    ifscCode: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelation: string | null;
    employmentType: string | null;
    seniorityLevel: string | null;
    experience: string | null;
    skills: string[] | null;
  } | null;
}

export interface EmployeeDocument {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export function useMyDetails(id: string | undefined) {
  return useQuery({
    queryKey: ["profile", id],
    queryFn: async () => (await api<Envelope<EmployeeDetails>>(`employees/${id}`)).data,
    enabled: !!id,
  });
}

export function useMyDocuments(id: string | undefined) {
  return useQuery({
    queryKey: ["profile", id, "documents"],
    queryFn: async () => (await api<Envelope<EmployeeDocument[]>>(`employees/${id}/documents`)).data ?? [],
    enabled: !!id,
  });
}

export function useProfileMutations() {
  const qc = useQueryClient();
  return {
    photo: useMutation({
      mutationFn: (file: File) => {
        const fd = new FormData();
        fd.append("profileImage", file);
        return api<{ success: boolean; profileImage: string }>("employees/profile-photo", { method: "POST", body: fd });
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["profile"] }),
    }),
    password: useMutation({
      mutationFn: (b: { currentPassword: string; newPassword: string }) => api("auth/change-password", { method: "POST", body: b }),
    }),
  };
}

// Values the legacy registration flow writes when nothing was provided. Treat them as empty.
const PLACEHOLDERS = new Set(["not provided", "not specified", "n/a", "na", "-", "null", "undefined", ""]);

export function real(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return PLACEHOLDERS.has(s.toLowerCase()) ? null : s;
}

/** Dates the legacy code fills in as defaults (DOB 2000-01-01) are not real data. */
export function realDate(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.startsWith("2000-01-01") ? null : v;
}

/** Shows only the last 4 characters of sensitive identifiers. */
export function mask(v: string | null | undefined, keep = 4): string | null {
  const s = real(v);
  if (!s) return null;
  return s.length <= keep ? s : `${"•".repeat(Math.min(8, s.length - keep))}${s.slice(-keep)}`;
}
