import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { AppNav } from "./app-nav";

/** Signed-in frame: slim header on phones, tab bar at the bottom, rail on wide screens. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row-reverse">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b px-4 md:hidden">
          <Logo />
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:pb-10"
        >
          {children}
        </main>
      </div>
      <AppNav />
    </div>
  );
}
