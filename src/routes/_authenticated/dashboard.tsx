import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  FileSpreadsheet,
  Layers,
  Loader2,
  Trash2,
  Upload,
  XCircle,
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

export interface BatchItem {
  id: string;
  filename: string;
  file: File;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  counts?: { sections: number; items: number; comments: number };
  templateId?: string;
}

function Dashboard() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const templates = useQuery({ queryKey: ["templates"], queryFn: listTemplates });

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const initialBatch: BatchItem[] = fileArray.map((f, index) => ({
      id: `${f.name}-${Date.now()}-${index}`,
      filename: f.name,
      file: f,
      status: "pending",
    }));

    setBatchItems(initialBatch);
    setImporting(true);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < initialBatch.length; i++) {
      const item = initialBatch[i];

      // Update item to processing
      setBatchItems((prev) =>
        prev.map((b) => (b.id === item.id ? { ...b, status: "processing" } : b)),
      );

      try {
        const parsed = await parseTemplateFile(item.file);
        const name = item.filename.replace(/\.(csv|xlsx|xls)$/i, "");
        const templateId = await importTemplate(name, item.filename, parsed);

        await queryClient.invalidateQueries({ queryKey: ["templates"] });
        successCount++;

        setBatchItems((prev) =>
          prev.map((b) =>
            b.id === item.id
              ? {
                  ...b,
                  status: "success",
                  templateId,
                  counts: parsed.counts,
                }
              : b,
          ),
        );
      } catch (error) {
        failCount++;
        const message =
          error instanceof ImportError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not parse spreadsheet.";

        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, status: "error", error: message } : b)),
        );
      }
    }

    setImporting(false);
    if (inputRef.current) inputRef.current.value = "";

    if (initialBatch.length === 1 && successCount === 1) {
      const firstSuccess = initialBatch.find((b) => b.templateId);
      if (firstSuccess?.templateId) {
        toast.success(`Imported ${firstSuccess.filename} successfully`);
      }
    } else {
      if (failCount === 0) {
        toast.success(`Bulk import completed: All ${successCount} files imported successfully!`);
      } else {
        toast.warning(
          `Bulk import finished: ${successCount} succeeded, ${failCount} failed. Check details below.`,
        );
      }
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

  const completedCount = batchItems.filter((b) => b.status === "success" || b.status === "error").length;
  const progressPercent = batchItems.length > 0 ? Math.round((completedCount / batchItems.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="eyebrow">Library</p>
            <h1 className="mt-1 text-3xl font-bold">Your templates</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Upload single or multiple Spectora spreadsheet exports (Export to spreadsheet → Export HTML Text).
              Sections, items and comments are extracted and saved to your account.
            </p>
          </div>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) {
              void handleFiles(e.dataTransfer.files);
            }
          }}
          className={`mt-8 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragging ? "border-accent bg-accent/10" : "border-border bg-card"
          }`}
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Upload className="size-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-semibold">Drop your Spectora spreadsheet(s) here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Supports single or bulk import of .xlsx, .xls or .csv files
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleFiles(e.target.files);
              }
            }}
          />
          <Button
            className="mt-4"
            onClick={() => inputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
            {importing ? `Processing batch (${completedCount}/${batchItems.length})…` : "Choose File(s)"}
          </Button>
        </div>

        {/* Bulk Import Progress & Results Card */}
        {batchItems.length > 0 && (
          <div className="mt-6 panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold">Import Batch Status</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                  {completedCount} of {batchItems.length} completed
                </span>
              </div>
              {importing && (
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Processing files… ({progressPercent}%)</span>
                </div>
              )}
            </div>

            {/* Overall Progress Bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* File Items List */}
            <div className="mt-4 divide-y divide-border/60">
              {batchItems.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.status === "processing" && (
                      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                    )}
                    {item.status === "pending" && (
                      <Clock className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    {item.status === "success" && (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                    )}
                    {item.status === "error" && (
                      <XCircle className="size-4 shrink-0 text-destructive" />
                    )}

                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{item.filename}</p>
                      {item.error && (
                        <p className="mt-0.5 text-xs text-destructive">{item.error}</p>
                      )}
                      {item.counts && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.counts.sections} sections · {item.counts.items} items · {item.counts.comments} comments
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === "processing" && (
                      <span className="text-xs font-semibold text-primary">Importing…</span>
                    )}
                    {item.status === "pending" && (
                      <span className="text-xs text-muted-foreground">In queue</span>
                    )}
                    {item.status === "error" && (
                      <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        Failed
                      </span>
                    )}
                    {item.status === "success" && item.templateId && (
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <Link to="/templates/$templateId" params={{ templateId: item.templateId }}>
                          Open Template
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Template Library */}
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
