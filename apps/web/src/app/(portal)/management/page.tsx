"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { isEmployeeRole } from "@/components/management/api";

export default function ManagementIndex() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    router.replace(isEmployeeRole(user?.role) ? "/management/projects" : "/management/employees");
  }, [user?.role, router]);
  return null;
}
