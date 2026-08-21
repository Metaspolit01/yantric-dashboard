"use client";

import { useState } from "react";
import AuthModal from "./AuthModal";

interface Props {
  isGuest: boolean;
  featureName: string;
  children: React.ReactNode;
}

/**
 * GuestGate allows guests to view and explore the page UI completely unobstructed (no blur, no lock box).
 * If the guest clicks anywhere on an interactive action inside the gate, it opens the AuthModal.
 */
export default function GuestGate({ isGuest, featureName, children }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!isGuest) {
    return <>{children}</>;
  }

  return (
    <div className="relative group">
      {/* Fully visible, un-blurred content for complete exploration */}
      <div className="relative">
        {children}
      </div>

      {/* Click interceptor for guest actions */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setModalOpen(true);
        }}
        title={`Sign in required to use ${featureName}`}
      />

      <AuthModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialMode="login"
        featureName={featureName}
      />
    </div>
  );
}
