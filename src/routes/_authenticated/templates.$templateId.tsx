import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { ArrowLeft, ChevronRight, Copy, Eye, Loader2, Pencil, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  duplicateTemplate,
  getTemplate,
  saveTemplateChanges,
  type SaveChanges,
} from "@/lib/template-api";

export const Route = createFileRoute("/_authenticated/templates/$templateId")({
  head: () => ({
    meta: [
      { title: "Edit template | Template Vault" },
      {
        name: "description",
        content: "Edit section names, item names and comment text for your inspection template.",
      },
      { property: "og:title", content: "Edit template | Template Vault" },
      {
        property: "og:description",
        content: "Edit section names, item names and comment text for your inspection template.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TemplateEditor,
});

type Draft = {
  templateName: string;
  sections: Record<string, string>;
  items: Record<string, string>;
  comments: Record<string, { name: string; body_html: string }>;
};

function TemplateEditor() {
  const { templateId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => getTemplate(templateId),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const data = query.data;

  useEffect(() => {
    if (!data) return;
    setDraft({
      templateName: data.template.name,
      sections: Object.fromEntries(data.sections.map((s) => [s.id, s.name])),
      items: Object.fromEntries(data.items.map((i) => [i.id, i.name])),
      comments: Object.fromEntries(
        data.comments.map((c) => [c.id, { name: c.name, body_html: c.body_html }]),
      ),
    });
    setOpenSections(Object.fromEntries(data.sections.slice(0, 1).map((s) => [s.id, true])));
  }, [data]);

  const changes: SaveChanges | null = useMemo(() => {
    if (!data || !draft) return null;
    const result: SaveChanges = { sections: [], items: [], comments: [] };
    if (draft.templateName !== data.template.name) {
      result.template = { name: draft.templateName };
    }
    data.sections.forEach((section) => {
      const next = draft.sections[section.id];
      if (next !== undefined && next !== section.name) result.sections.push({ id: section.id, name: next });
    });
    data.items.forEach((item) => {
      const next = draft.items[item.id];
      if (next !== undefined && next !== item.name) result.items.push({ id: item.id, name: next });
    });
    data.comments.forEach((comment) => {
      const next = draft.comments[comment.id];
      if (!next) return;
      if (next.name !== comment.name || next.body_html !== comment.body_html) {
        result.comments.push({ id: comment.id, name: next.name, body_html: next.body_html });
      }
    });
    return result;
  }, [data, draft]);

  const dirtyCount = changes
    ? (changes.template ? 1 : 0) +
      changes.sections.length +
      changes.items.length +
      changes.comments.length
    : 0;

  const save = async () => {
    if (!changes || dirtyCount === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveTemplateChanges(templateId, changes);
      await queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Changes saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your changes";
      setSaveError(message);
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    try {
      const newId = await duplicateTemplate(templateId);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Copy created — editing the copy won't change this one");
      await router.navigate({ to: "/templates/$templateId", params: { templateId: newId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate this template");
    }
  };

  const itemsBySection = useMemo(() => {
    const map = new Map<string, typeof data extends undefined ? never : NonNullable<typeof data>["items"]>();
    data?.items.forEach((item) => {
      const list = map.get(item.section_id) ?? [];
      list.push(item);
      map.set(item.section_id, list);
    });
    return map;
  }, [data]);

  const commentsByItem = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["comments"]>();
    data?.comments.forEach((comment) => {
      const list = map.get(comment.item_id) ?? [];
      list.push(comment);
      map.set(comment.item_id, list);
    });
    return map;
  }, [data]);

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader email={user.email} />

      <main className="mx-auto max-w-5xl px-4 py-8 pb-32">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All templates
        </Link>

        {query.isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading template…</p>
        ) : query.isError || !data || !draft ? (
          <div className="panel mt-8 p-8 text-center">
            <p className="text-sm font-semibold">We couldn't open this template</p>
            <p className="mt-1 text-sm text-muted-foreground">
              It may have been deleted. Go back to your library and try again.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Template name</p>
                <Input
                  value={draft.templateName}
                  maxLength={200}
                  onChange={(e) => setDraft({ ...draft, templateName: e.target.value })}
                  className="mt-1 h-11 border-0 border-b border-border bg-transparent px-0 font-display text-2xl font-bold shadow-none focus-visible:ring-0"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.sections.length} sections · {data.items.length} items ·{" "}
                  {data.comments.length} comments
                  {data.template.source_filename ? ` · from ${data.template.source_filename}` : ""}
                </p>
              </div>
              <Button variant="outline" onClick={() => void duplicate()}>
                <Copy className="size-4" />
                Duplicate
              </Button>
            </div>

            {data.issues.length > 0 ? (
              <div className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-4">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="size-4 text-warning-foreground" />
                  <p className="text-sm font-semibold">
                    {data.issues.length} row{data.issues.length === 1 ? "" : "s"} weren't imported
                  </p>
                </div>
                <ul className="mt-3 space-y-2">
                  {data.issues.map((issue) => (
                    <li key={issue.id} className="text-xs text-foreground/80">
                      <span className="font-semibold">
                        {issue.row_number ? `Row ${issue.row_number}: ` : ""}
                      </span>
                      {issue.reason}
                      {issue.raw_excerpt ? (
                        <span className="ml-1 font-mono text-muted-foreground">
                          “{issue.raw_excerpt}”
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-8 space-y-3">
              {data.sections.map((section) => {
                const open = openSections[section.id] ?? false;
                const items = itemsBySection.get(section.id) ?? [];
                return (
                  <div key={section.id} className="panel overflow-hidden">
                    <div className="flex items-center gap-2 p-4">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, [section.id]: !open })}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-secondary"
                        aria-label={open ? "Collapse section" : "Expand section"}
                      >
                        <ChevronRight
                          className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
                        />
                      </button>
                      <Input
                        value={draft.sections[section.id] ?? ""}
                        maxLength={300}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            sections: { ...draft.sections, [section.id]: e.target.value },
                          })
                        }
                        className="h-9 border-0 bg-transparent px-1 font-display text-base font-bold shadow-none focus-visible:ring-0"
                      />
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                        {items.length}
                      </span>
                    </div>

                    {open ? (
                      <div className="space-y-4 border-t border-border bg-surface/60 p-4">
                        {items.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No items in this section.</p>
                        ) : null}
                        {items.map((item) => {
                          const comments = commentsByItem.get(item.id) ?? [];
                          return (
                            <div key={item.id} className="rounded-md border border-border bg-card p-4">
                              <div className="flex items-center gap-2">
                                <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                                <Input
                                  value={draft.items[item.id] ?? ""}
                                  maxLength={300}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      items: { ...draft.items, [item.id]: e.target.value },
                                    })
                                  }
                                  className="h-8 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
                                />
                              </div>

                              <div className="mt-3 space-y-3">
                                {comments.length === 0 ? (
                                  <p className="pl-6 text-xs text-muted-foreground">No comments.</p>
                                ) : null}
                                {comments.map((comment) => {
                                  const value = draft.comments[comment.id];
                                  if (!value) return null;
                                  const isPreview = previewing[comment.id] ?? false;
                                  return (
                                    <div
                                      key={comment.id}
                                      className="rounded-md border border-border bg-surface p-3"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Input
                                          value={value.name}
                                          maxLength={300}
                                          placeholder="Comment name"
                                          onChange={(e) =>
                                            setDraft({
                                              ...draft,
                                              comments: {
                                                ...draft.comments,
                                                [comment.id]: { ...value, name: e.target.value },
                                              },
                                            })
                                          }
                                          className="h-8 bg-card text-sm"
                                        />
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={isPreview ? "secondary" : "ghost"}
                                          onClick={() =>
                                            setPreviewing({ ...previewing, [comment.id]: !isPreview })
                                          }
                                        >
                                          <Eye className="size-3.5" />
                                          {isPreview ? "Edit" : "Preview"}
                                        </Button>
                                      </div>

                                      {isPreview ? (
                                        <div
                                          className="comment-html mt-2 rounded-md bg-card p-3"
                                          dangerouslySetInnerHTML={{
                                            __html: DOMPurify.sanitize(value.body_html),
                                          }}
                                        />
                                      ) : (
                                        <Textarea
                                          value={value.body_html}
                                          rows={4}
                                          onChange={(e) =>
                                            setDraft({
                                              ...draft,
                                              comments: {
                                                ...draft.comments,
                                                [comment.id]: { ...value, body_html: e.target.value },
                                              },
                                            })
                                          }
                                          className="mt-2 bg-card font-mono text-xs"
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {draft ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {saveError
                ? saveError
                : dirtyCount === 0
                  ? "All changes saved"
                  : `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`}
            </p>
            <Button onClick={() => void save()} disabled={saving || dirtyCount === 0}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
