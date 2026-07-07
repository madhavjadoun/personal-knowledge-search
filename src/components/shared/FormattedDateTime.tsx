"use client";

import { useEffect, useState } from "react";

interface FormattedDateTimeProps {
  date?: string | Date | null;
  type?: "date" | "time";
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}

export default function FormattedDateTime({ date, type = "date", options, fallback = "N/A" }: FormattedDateTimeProps) {
  const [formatted, setFormatted] = useState<string>("");

  useEffect(() => {
    if (!date) {
      setFormatted(fallback);
      return;
    }

    const d = new Date(date);
    if (isNaN(d.getTime())) {
      setFormatted(String(date));
      return;
    }

    if (type === "time") {
      setFormatted(d.toLocaleTimeString("en-US", options || { hour: "2-digit", minute: "2-digit" }));
    } else {
      setFormatted(d.toLocaleDateString("en-US", options || { month: "short", day: "numeric", year: "numeric" }));
    }
  }, [date, type, options, fallback]);

  return <>{formatted}</>;
}
