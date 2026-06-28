import { ExternalLinkIcon, SparklesIcon } from "lucide-react";

import { ProxySettingsForm } from "@/components/ProxySettingsForm";

export const metadata = {
  title: "Proxies - Inventory Monitor",
};

export default function ProxiesPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
          <h1 className="text-base font-medium tracking-tight text-foreground">
            Proxies
          </h1>
          <a
            href="https://www.onestopproxies.com/register?ref=N27EZE25"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit max-w-full items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/15 sm:ml-auto"
          >
            <SparklesIcon className="size-3.5 text-emerald-500" aria-hidden="true" />
            <span className="truncate">Recommended: OneStop Proxies</span>
            <ExternalLinkIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-[820px] px-6 pt-8 pb-24">
        <ProxySettingsForm />
      </main>
    </div>
  );
}
