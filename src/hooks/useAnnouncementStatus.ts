import { useCallback, useState } from "react";

export interface AnnouncementStatus {
  message: string;
  nonce: number;
}

const emptyStatus: AnnouncementStatus = { message: "", nonce: 0 };

export function useAnnouncementStatus(initialStatus: AnnouncementStatus = emptyStatus) {
  const [status, setStatus] = useState<AnnouncementStatus>(initialStatus);

  const reset = useCallback(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const announce = useCallback((message: string) => {
    setStatus((current) => ({ message, nonce: current.nonce + 1 }));
  }, []);

  return {
    status,
    announce,
    reset
  };
}
