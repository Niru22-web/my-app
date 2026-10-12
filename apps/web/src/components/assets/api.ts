"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";
import type { Envelope } from "@/lib/types";

// ── Shapes returned by /api/assets and /api/asset-requests ─────────────────

export interface Vendor {
  id: string;
  vendorName: string;
  company: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstNumber: string | null;
  contactPerson: string | null;
}

export interface Asset {
  id: string;
  assetId: string | null;
  assetName: string;
  category: string;
  type: string;
  serialNumber: string;
  status: string;
  officeTagNo: string | null;
  condition: string;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiry: string | null;
  location: string | null;
  description: string | null;
  vendorId: string | null;
  vendorRelation: Vendor | null;
  createdAt: string;
}

export interface Allocation {
  id: string;
  requestId: string | null;
  inventoryId: string;
  employeeId: string;
  allocatedAt: string;
  returnedAt: string | null;
  status: string;
  remarks: string | null;
  employee?: { id: string; firstName: string; lastName: string | null; employeeId: string; department: string | null };
  inventory: Asset;
}

export interface Maintenance {
  id: string;
  inventoryId: string;
  type: string;
  date: string;
  cost: number | null;
  description: string | null;
  status: string;
  inventory?: Pick<Asset, "id" | "assetName" | "serialNumber" | "officeTagNo">;
}

export interface AssetRequest {
  id: string;
  requestId: string;
  employeeId: string;
  assetType: string;
  assetCategory: string | null;
  title: string;
  description: string | null;
  priority: string;
  requiredDate: string | null;
  quantity: number;
  deliveryLocation: string | null;
  status: string;
  remarks: string | null;
  approvedAt: string | null;
  createdAt: string;
  employee?: { firstName: string; lastName: string | null; employeeId: string; department: string | null };
  approver?: { firstName: string; lastName: string | null } | null;
  allocations?: { id: string; inventory: Asset }[];
}

export interface Category {
  id: string;
  name: string;
  category: string;
}
export interface AssetType {
  id: string;
  name: string;
  assetCategoryId: string;
  category?: Category;
}
export interface Location {
  id: string;
  name: string;
}

// ── Access (mirrors what the API actually enforces, never wider) ───────────

const REQUESTERS = ["employee", "user", "manager", "partner", "accountant", ""];
/** Uses "My assets & requests" instead of the inventory screens (legacy behaviour). */
export const isRequester = (role?: string | null) => REQUESTERS.includes(normRole(role));
/** Can add/edit assets, assign and return (backend hasITAccess for these roles). */
export const canManageAssets = (role?: string | null) => ["admin", "owner", "it", "hr", "accounts", "accounts_admin", "accounts_manager"].includes(normRole(role));
/** Vendors and maintenance status (backend isManagement). */
export const canManageOps = (role?: string | null) => ["admin", "owner", "it", "hr"].includes(normRole(role));
/** Approve / reject / fulfil requests: the API only allows Admin and HR. */
export const canApproveRequests = (role?: string | null) => ["admin", "hr"].includes(normRole(role));

// ── Status vocabulary ──────────────────────────────────────────────────────

/** Allocation flows write "Allocated"; older rows may say "Assigned". */
export const assetStatus = (s: string) => (s === "Assigned" ? "Allocated" : s);
export const ASSET_TONE: Record<string, "success" | "brand" | "warning" | "neutral" | "danger"> = {
  Available: "success",
  Allocated: "brand",
  Maintenance: "warning",
  Retired: "neutral",
  Lost: "danger",
};
export const REQUEST_TONE: Record<string, "warning" | "brand" | "success" | "danger" | "neutral"> = {
  Pending: "warning",
  Approved: "brand",
  Allocated: "success",
  Rejected: "danger",
};

const list = async <T,>(path: string, query?: Record<string, string | undefined>) => (await api<Envelope<T[]>>(path, { query })).data ?? [];

// ── Queries ────────────────────────────────────────────────────────────────

export const useAssets = (enabled = true) => useQuery({ queryKey: ["assets", "inventory"], queryFn: () => list<Asset>("assets"), enabled });
export const useAllocations = (enabled = true) => useQuery({ queryKey: ["assets", "allocations"], queryFn: () => list<Allocation>("assets/allocations"), enabled });
export const useMyAllocations = () => useQuery({ queryKey: ["assets", "mine"], queryFn: () => list<Allocation>("assets/my-allocations") });
export const useMaintenance = (enabled = true) => useQuery({ queryKey: ["assets", "maintenance"], queryFn: () => list<Maintenance>("assets/maintenance"), enabled });
export const useVendors = (enabled = true) => useQuery({ queryKey: ["assets", "vendors"], queryFn: () => list<Vendor>("assets/vendors"), enabled });
export const useCategories = (enabled = true) => useQuery({ queryKey: ["assets", "categories"], queryFn: () => list<Category>("assets/masters/categories"), enabled });
export const useTypes = (enabled = true) => useQuery({ queryKey: ["assets", "types"], queryFn: () => list<AssetType>("assets/masters/types"), enabled });
export const useLocations = (enabled = true) => useQuery({ queryKey: ["assets", "locations"], queryFn: () => list<Location>("assets/masters/locations"), enabled });
export const useMyRequests = () => useQuery({ queryKey: ["assets", "requests", "mine"], queryFn: () => list<AssetRequest>("asset-requests/my-requests") });
export const useAllRequests = (enabled = true) => useQuery({ queryKey: ["assets", "requests", "all"], queryFn: () => list<AssetRequest>("asset-requests/all-requests"), enabled });

// ── Mutations ──────────────────────────────────────────────────────────────

export interface AssetInput {
  assetName: string;
  serialNumber: string;
  category: string;
  type: string;
  officeTagNo?: string;
  assetId?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyExpiry?: string;
  vendorId?: string;
  location?: string;
  description?: string;
  condition?: string;
  status?: string;
}

function useM<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useAssetMutations() {
  return {
    create: useM((b: AssetInput) => api("assets", { method: "POST", body: b })),
    update: useM(({ id, body }: { id: string; body: Partial<AssetInput> }) => api(`assets/${id}`, { method: "PUT", body })),
    assign: useM((b: { employeeId: string; inventoryId: string; remarks?: string }) => api("assets/allocations/assign", { method: "POST", body: b })),
    giveBack: useM(({ id, ...body }: { id: string; condition?: string; remarks?: string }) => api(`assets/allocations/${id}/return`, { method: "PATCH", body })),
    transfer: useM(({ id, ...body }: { id: string; employeeId: string; remarks?: string }) => api(`assets/allocations/${id}/transfer`, { method: "POST", body })),
    logMaintenance: useM((b: { inventoryId: string; type: string; date: string; cost?: number; description?: string }) => api("assets/maintenance", { method: "POST", body: b })),
    setMaintenance: useM(({ id, status }: { id: string; status: string }) => api(`assets/maintenance/${id}`, { method: "PUT", body: { status } })),
    saveVendor: useM(({ id, ...body }: Partial<Vendor> & { vendorName: string; company: string }) =>
      id ? api(`assets/vendors/${id}`, { method: "PUT", body }) : api("assets/vendors", { method: "POST", body }),
    ),
    deleteVendor: useM((id: string) => api(`assets/vendors/${id}`, { method: "DELETE" })),
    addMaster: useM(({ kind, body }: { kind: "categories" | "types" | "locations"; body: Record<string, string> }) => api(`assets/masters/${kind}`, { method: "POST", body })),
    deleteMaster: useM(({ kind, id }: { kind: "categories" | "types" | "locations"; id: string }) => api(`assets/masters/${kind}/${id}`, { method: "DELETE" })),
    request: useM((b: Record<string, unknown>) => api("asset-requests/requests", { method: "POST", body: b })),
    decide: useM(({ id, status, remarks }: { id: string; status: "Approved" | "Rejected"; remarks?: string }) => api(`asset-requests/requests/${id}/status`, { method: "PATCH", body: { status, remarks } })),
    fulfil: useM((b: { requestId: string; inventoryId: string; remarks?: string }) => api("asset-requests/allocate", { method: "POST", body: b })),
  };
}

export const personName = (p?: { firstName: string; lastName: string | null } | null) => (p ? `${p.firstName} ${p.lastName ?? ""}`.trim() : "");
