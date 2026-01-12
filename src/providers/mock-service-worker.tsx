'use client';

import { useEffect } from "react";

export function MockServiceWorker() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_USE_MOCK === "true") {
      import("../mocks/browser")
        .then(({ worker }) => worker.start())
        .catch((error) => {
          if (process.env.NODE_ENV !== "production") {
            console.error("Failed to start MSW", error);
          }
        });
    }
  }, []);

  return null;
}
