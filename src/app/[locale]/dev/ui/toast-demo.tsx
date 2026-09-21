"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => toast.success("Saved")}>
        Success toast
      </Button>
      <Button variant="outline" onClick={() => toast.error("Something went wrong")}>
        Error toast
      </Button>
    </div>
  );
}
