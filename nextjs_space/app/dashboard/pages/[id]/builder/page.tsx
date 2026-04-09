"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PageBuilder() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the webcreator builder
    router.push("/dashboard/webcreator");
  }, [router]);

  return null;
}