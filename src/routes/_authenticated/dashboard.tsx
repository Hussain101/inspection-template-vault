import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImportError, parseTemplateFile } from "@/lib/spectora-parser";
import {
  deleteTemplate,
  duplicateTemplate,
  importTemplate,
  listTemplates,
} from "@/lib/template-api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your templates | Template Vault" },
      {
        name: "description",
        content: "Import Spectora spreadsheet exports and manage your home inspection templates.",
      },
      { property: "og:title", content: "Your templates | Template Vault" },
      {
        property: "og:description",
        content: "Import Spectora spreadsheet exports and manage your home inspection templates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const templates = useQuery({ queryKey: ["templates"], queryFn: listTemplates });

  const handleFile = async (file: File) => {
    setImportError(null);
    setImporting(true);
    try {
      const parsed = await parseTemplateFile(file);
      const name = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
      const id = await importTemplate(name, file.name, parsed);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(
        `Imported ${parsed.counts.sections} sections, ${parsed.counts.items} items and ${parsed.counts.comments} comments.`,
      );
      await router.navigate({ to: "/templates/$templateId", params: { templateId: id } });
    } catch (error) {
      const message =
        error instanceof ImportError
          ? error.message
          : error instanceof Error
            ? error.message
            : "We couldn't import that file.";
      setImportError(message);
      toast.error("Import failed");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newId = await duplicateTemplate(id);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Copy created");
      await router.navigate({ to: "/templates/$templateId", params: { templateId: newId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate that template");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTemplate(pendingDelete.id);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that template");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="eyebrow">Library</p>
        <h1 className="mt-1 text-3xl font-bold">Your templates</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Upload a Spectora spreadsheet export (Export to spreadsheet → Export HTML Text). Sections,
          items and comments are stored separately so you can edit and copy them freely.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={`mt-8 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-accent bg-accent/10" : "border-border bg-card"
          }`}
        >
          <Upload className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Drop your spreadsheet here</p>
          <p className="mt-1 text-xs text-muted-foreground">.xlsx, .xls or .csv</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button
            className="mt-4"
            onClick={() => inputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : null}
            {importing ? "Importing…" : "Choose file"}
          </Button>
        </div>

        {importError ? (
          <div className="mt-4 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-destructive">Import failed</p>
              <p className="mt-1 text-sm text-foreground">{importError}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-10">
          {templates.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your templates…</p>
          ) : templates.isError ? (
            <p className="text-sm text-destructive">
              We couldn't load your templates. Please refresh the page.
            </p>
          ) : templates.data && templates.data.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.data.map((template) => (
                <div key={template.id} className="panel flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <FileSpreadsheet className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        to="/templates/$templateId"
                        params={{ templateId: template.id }}
                        className="block truncate font-display text-sm font-bold hover:underline"
                      >
                        {template.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(template.created_at).toLocaleDateString()}
                        {template.copied_from ? " · copy" : ""}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Sections", template.sectionCount],
                      ["Items", template.itemCount],
                      ["Comments", template.commentCount],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-md bg-surface py-2">
                        <dt className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="font-display text-base font-bold">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-4 flex gap-2">
                    <Button asChild size="sm" className="flex-1">
                      <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                        Open
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDuplicate(template.id)}
                      aria-label="Duplicate template"
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPendingDelete({ id: template.id, name: template.name })}
                      aria-label="Delete template"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel p-10 text-center">
              <p className="text-sm font-medium">No templates yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Import your first Spectora export to get started.
              </p>
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the template and all of its sections, items and comments. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
