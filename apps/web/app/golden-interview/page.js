"use client";

import { Suspense } from "react";
import ChatInterface from "../../components/golden-interview/ChatInterface";

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        <p className="text-sm text-slate-600">Preparing your interview...</p>
      </div>
    </div>
  );
}

export default function GoldenInterviewPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ChatInterface />
    </Suspense>
  );
}
