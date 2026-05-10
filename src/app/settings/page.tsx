import { SettingsForm } from "@/components/SettingsForm";

export const metadata = {
  title: "Settings — Inventory Monitor",
};

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex max-w-[720px] items-center gap-4 px-6 py-4">
          <h1 className="text-base font-medium tracking-tight text-foreground">
            Settings
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-6 pt-8 pb-24">
        <SettingsForm />
      </main>
    </div>
  );
}
