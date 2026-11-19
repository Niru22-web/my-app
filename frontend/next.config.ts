import type { NextConfig } from "next";

// The API runs as a separate service. In development, requests to /api and
// /uploads are forwarded to it so the browser only ever talks to one origin.
// On Vercel set API_ORIGIN to the hosted API (e.g. https://asa-portal-api.onrender.com). Rewrites are fixed at
// build time, so changing it needs a redeploy.
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://127.0.0.1:5000").replace(/\/$/, "");
if (process.env.VERCEL && !process.env.API_ORIGIN) {
  throw new Error("API_ORIGIN is not set. Add it in Vercel → Project → Settings → Environment Variables (the Render API URL), then redeploy.");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Every role now shares one dashboard; old role-specific home URLs keep working.
  async redirects() {
    return [
      ...["/admin", "/hr", "/manager", "/partner", "/employee"].map((source) => ({
        source,
        destination: "/dashboard",
        permanent: false,
      })),
      // The old per-day report page is replaced by the monthly view with a day timeline.
      { source: "/attendance/report/:employeeId/:date", destination: "/attendance/monthly/:employeeId", permanent: false },
      // Legacy My Portal URLs, plus the approval links the API puts in notifications.
      { source: "/portal", destination: "/portal/profile", permanent: false },
      { source: "/profile", destination: "/portal/profile", permanent: false },
      { source: "/leave-management", destination: "/leave", permanent: false },
      { source: "/reimbursement", destination: "/portal/reimbursements", permanent: false },
      { source: "/reimbursements", destination: "/portal/reimbursements", permanent: false },
      { source: "/approvals/leaves", destination: "/leave/team", permanent: false },
      { source: "/approvals/reimbursement", destination: "/portal/reimbursements/team", permanent: false },
      { source: "/employee/asset-requests", destination: "/admin/asset-management/dashboard", permanent: false },
      // Old pages with no separate equivalent. Analytics only ever showed sample data.
      { source: "/analytics", destination: "/reports/org", permanent: false },
      { source: "/accounts/ar-management", destination: "/accounts/dashboard", permanent: false },
      { source: "/corporate-calendar", destination: "/calendar", permanent: false },
      { source: "/helpdesk", destination: "/help-desk", permanent: false },
      { source: "/admin/asset-management/inventory", destination: "/admin/asset-management/assets", permanent: false },
      { source: "/admin/asset-management/tickets", destination: "/help-desk", permanent: false },
      { source: "/admin/asset-management/reports", destination: "/admin/asset-management/assets", permanent: false },
      // Public self-registration let anyone create an active account with any role; staff are invited instead.
      { source: "/register", destination: "/login", permanent: false },
      { source: "/signup", destination: "/login", permanent: false },
      ...["/manager/:path+", "/employee/:path+"].map((source) => ({ source, destination: "/dashboard", permanent: false })),
      { source: "/admin-panel", destination: "/admin-portal/dashboard", permanent: false },
      { source: "/admin/masters", destination: "/admin-portal/masters", permanent: false },
      { source: "/admin-portal/masters/helpdesk-categories", destination: "/help-desk/categories", permanent: false },
      { source: "/admin-portal/categories", destination: "/help-desk/categories", permanent: false },
      { source: "/admin/helpdesk/categories", destination: "/help-desk/categories", permanent: false },
      { source: "/admin-portal/masters/:type", destination: "/admin-portal/masters?type=:type", permanent: false },
      { source: "/admin/user-access", destination: "/admin-portal/users", permanent: false },
      { source: "/admin/OrganizationHierarchy", destination: "/admin-portal/hierarchy", permanent: false },
      { source: "/admin-portal/email-config", destination: "/admin-portal/email-templates", permanent: false },
      { source: "/email-configuration", destination: "/admin-portal/email-templates", permanent: false },
      { source: "/email-templates", destination: "/admin-portal/email-templates", permanent: false },
      ...["employees", "clients", "projects", "jobs"].map((s) => ({ source: `/${s}`, destination: `/management/${s}`, permanent: false })),
    ];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
