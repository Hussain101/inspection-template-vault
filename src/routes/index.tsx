import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, FileSpreadsheet, PencilLine, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Template Vault — Home inspection template manager" },
      {
        name: "description",
        content:
          "Import your Spectora spreadsheet exports, edit sections, items and comments, duplicate templates, and keep everything saved in one place.",
      },
      { property: "og:title", content: "Template Vault — Home inspection template manager" },
      {
        property: "og:description",
        content:
          "Import Spectora spreadsheet exports, edit them, duplicate them, and store them safely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    icon: FileSpreadsheet,
    title: "Import your export",
    body: "Upload the spreadsheet from Spectora (Export to spreadsheet → Export HTML Text). Sections, items and comments are rebuilt exactly as they were, and anything unrecognised is listed for you.",
  },
  {
    icon: PencilLine,
    title: "Edit in place",
    body: "Rename sections and items, rewrite comment text, and save everything in one go. Nothing is stored as an unreadable blob.",
  },
  {
    icon: Copy,
    title: "Copy without risk",
    body: "Duplicate a template to build a variant. The copy is fully independent — editing it never touches the original.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen bg-surface">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList className="size-4" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight">Template Vault</span>
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-3xl px-4 pt-16 pb-14 text-center">
        <p className="eyebrow">For home inspectors</p>
        <h1 className="mt-4 font-display text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
          Your inspection templates, finally easy to work with
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          Bring in your existing template export, tidy it up, make copies for different job types,
          and come back to it any time. Everything stays saved to your account.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard">Go to my templates</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.title} className="panel p-6">
            <span className="flex size-9 items-center justify-center rounded-md bg-accent/15 text-accent-foreground">
              <step.icon className="size-4" />
            </span>
            <h2 className="mt-4 font-display text-base font-bold">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
