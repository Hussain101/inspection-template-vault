import { supabase } from "@/integrations/supabase/client";
import type { ParseResult } from "./spectora-parser";

export type TemplateRow = {
  id: string;
  name: string;
  source_filename: string | null;
  copied_from: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateSummary = TemplateRow & {
  sectionCount: number;
  itemCount: number;
  commentCount: number;
};

export type SectionRow = { id: string; name: string; position: number };
export type ItemRow = { id: string; section_id: string; name: string; position: number };
export type CommentRow = {
  id: string;
  item_id: string;
  name: string;
  body_html: string;
  position: number;
};
export type IssueRow = {
  id: string;
  row_number: number | null;
  raw_excerpt: string;
  reason: string;
};

export type TemplateDetail = {
  template: TemplateRow;
  sections: SectionRow[];
  items: ItemRow[];
  comments: CommentRow[];
  issues: IssueRow[];
};

function chunk<T>(list: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const { data, error } = await supabase
    .from("templates")
    .select("id,name,source_filename,copied_from,created_at,updated_at,sections(id,items(id,comments(id)))")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const sections = (row.sections ?? []) as { id: string; items: { id: string; comments: { id: string }[] }[] }[];
    const items = sections.flatMap((s) => s.items ?? []);
    return {
      id: row.id,
      name: row.name,
      source_filename: row.source_filename,
      copied_from: row.copied_from,
      created_at: row.created_at,
      updated_at: row.updated_at,
      sectionCount: sections.length,
      itemCount: items.length,
      commentCount: items.reduce((total, item) => total + (item.comments?.length ?? 0), 0),
    };
  });
}

export async function getTemplate(templateId: string): Promise<TemplateDetail> {
  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id,name,source_filename,copied_from,created_at,updated_at")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError) throw new Error(templateError.message);
  if (!template) throw new Error("Template not found");

  const { data: sections, error: sectionError } = await supabase
    .from("sections")
    .select("id,name,position")
    .eq("template_id", templateId)
    .order("position");
  if (sectionError) throw new Error(sectionError.message);

  const sectionIds = (sections ?? []).map((s) => s.id);

  let items: ItemRow[] = [];
  if (sectionIds.length > 0) {
    const { data, error } = await supabase
      .from("items")
      .select("id,section_id,name,position")
      .in("section_id", sectionIds)
      .order("position");
    if (error) throw new Error(error.message);
    items = data ?? [];
  }

  let comments: CommentRow[] = [];
  const itemIds = items.map((i) => i.id);
  if (itemIds.length > 0) {
    for (const group of chunk(itemIds, 200)) {
      const { data, error } = await supabase
        .from("comments")
        .select("id,item_id,name,body_html,position")
        .in("item_id", group)
        .order("position");
      if (error) throw new Error(error.message);
      comments = comments.concat(data ?? []);
    }
  }

  const { data: issues, error: issueError } = await supabase
    .from("import_issues")
    .select("id,row_number,raw_excerpt,reason")
    .eq("template_id", templateId)
    .order("row_number", { nullsFirst: true });
  if (issueError) throw new Error(issueError.message);

  return {
    template,
    sections: sections ?? [],
    items,
    comments,
    issues: issues ?? [],
  };
}

export async function importTemplate(
  name: string,
  sourceFilename: string,
  parsed: ParseResult,
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("You need to be signed in to import a template.");

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .insert({ name, source_filename: sourceFilename, owner_id: userId })
    .select("id")
    .single();
  if (templateError) throw new Error(templateError.message);

  const templateId = template.id;

  try {
    const sectionPayload = parsed.sections.map((section, index) => ({
      template_id: templateId,
      name: section.name,
      position: index,
    }));

    const { data: sectionRows, error: sectionError } = await supabase
      .from("sections")
      .insert(sectionPayload)
      .select("id,position");
    if (sectionError) throw new Error(sectionError.message);

    const sectionByPosition = new Map((sectionRows ?? []).map((row) => [row.position, row.id]));

    const itemPayload: { section_id: string; name: string; position: number }[] = [];
    const itemOwner: { sectionIndex: number; itemIndex: number }[] = [];

    parsed.sections.forEach((section, sectionIndex) => {
      const sectionId = sectionByPosition.get(sectionIndex);
      if (!sectionId) return;
      section.items.forEach((item, itemIndex) => {
        itemPayload.push({ section_id: sectionId, name: item.name, position: itemIndex });
        itemOwner.push({ sectionIndex, itemIndex });
      });
    });

    const itemIdByKey = new Map<string, string>();
    for (const group of chunk(itemPayload)) {
      const { data, error } = await supabase
        .from("items")
        .insert(group)
        .select("id,section_id,position");
      if (error) throw new Error(error.message);
      (data ?? []).forEach((row) => {
        itemIdByKey.set(`${row.section_id}:${row.position}`, row.id);
      });
    }

    const commentPayload: { item_id: string; name: string; body_html: string; position: number }[] = [];
    parsed.sections.forEach((section, sectionIndex) => {
      const sectionId = sectionByPosition.get(sectionIndex);
      if (!sectionId) return;
      section.items.forEach((item, itemIndex) => {
        const itemId = itemIdByKey.get(`${sectionId}:${itemIndex}`);
        if (!itemId) return;
        item.comments.forEach((comment, commentIndex) => {
          commentPayload.push({
            item_id: itemId,
            name: comment.name,
            body_html: comment.bodyHtml,
            position: commentIndex,
          });
        });
      });
    });

    for (const group of chunk(commentPayload)) {
      const { error } = await supabase.from("comments").insert(group);
      if (error) throw new Error(error.message);
    }

    if (parsed.issues.length > 0) {
      const issuePayload = parsed.issues.slice(0, 500).map((issue) => ({
        template_id: templateId,
        row_number: issue.rowNumber,
        raw_excerpt: issue.rawExcerpt,
        reason: issue.reason,
      }));
      for (const group of chunk(issuePayload)) {
        const { error } = await supabase.from("import_issues").insert(group);
        if (error) throw new Error(error.message);
      }
    }

    void itemOwner;
    return templateId;
  } catch (error) {
    await supabase.from("templates").delete().eq("id", templateId);
    throw error;
  }
}

export async function duplicateTemplate(templateId: string, newName?: string): Promise<string> {
  const { data, error } = await supabase.rpc("duplicate_template", {
    source_id: templateId,
    ...(newName ? { new_name: newName } : {}),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function deleteTemplate(templateId: string) {
  const { error } = await supabase.from("templates").delete().eq("id", templateId);
  if (error) throw new Error(error.message);
}

export type SaveChanges = {
  template?: { name: string };
  sections: { id: string; name: string }[];
  items: { id: string; name: string }[];
  comments: { id: string; name: string; body_html: string }[];
};

export async function saveTemplateChanges(templateId: string, changes: SaveChanges) {
  if (changes.template) {
    const { error } = await supabase
      .from("templates")
      .update({ name: changes.template.name })
      .eq("id", templateId);
    if (error) throw new Error(error.message);
  }

  await Promise.all(
    changes.sections.map(async (section) => {
      const { error } = await supabase
        .from("sections")
        .update({ name: section.name })
        .eq("id", section.id);
      if (error) throw new Error(error.message);
    }),
  );

  await Promise.all(
    changes.items.map(async (item) => {
      const { error } = await supabase.from("items").update({ name: item.name }).eq("id", item.id);
      if (error) throw new Error(error.message);
    }),
  );

  await Promise.all(
    changes.comments.map(async (comment) => {
      const { error } = await supabase
        .from("comments")
        .update({ name: comment.name, body_html: comment.body_html })
        .eq("id", comment.id);
      if (error) throw new Error(error.message);
    }),
  );

  if (!changes.template) {
    await supabase.from("templates").update({ updated_at: new Date().toISOString() }).eq("id", templateId);
  }
}
