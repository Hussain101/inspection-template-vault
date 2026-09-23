-- TEMPLATES
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  source_filename TEXT,
  copied_from UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read templates" ON public.templates FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners insert templates" ON public.templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update templates" ON public.templates FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete templates" ON public.templates FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- SECTIONS
CREATE TABLE public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sections_template_idx ON public.sections(template_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage sections" ON public.sections FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.owner_id = auth.uid()));

-- ITEMS
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX items_section_idx ON public.items(section_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage items" ON public.items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.sections s JOIN public.templates t ON t.id = s.template_id WHERE s.id = section_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.sections s JOIN public.templates t ON t.id = s.template_id WHERE s.id = section_id AND t.owner_id = auth.uid()));

-- COMMENTS
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_item_idx ON public.comments(item_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage comments" ON public.comments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.items i JOIN public.sections s ON s.id = i.section_id JOIN public.templates t ON t.id = s.template_id WHERE i.id = item_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.items i JOIN public.sections s ON s.id = i.section_id JOIN public.templates t ON t.id = s.template_id WHERE i.id = item_id AND t.owner_id = auth.uid()));

-- IMPORT ISSUES
CREATE TABLE public.import_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  row_number INTEGER,
  raw_excerpt TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX import_issues_template_idx ON public.import_issues(template_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_issues TO authenticated;
GRANT ALL ON public.import_issues TO service_role;
ALTER TABLE public.import_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage import issues" ON public.import_issues FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.owner_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER templates_touch_updated_at
BEFORE UPDATE ON public.templates
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DUPLICATE TEMPLATE
CREATE OR REPLACE FUNCTION public.duplicate_template(source_id UUID, new_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.templates (owner_id, name, source_filename, copied_from)
  SELECT auth.uid(), COALESCE(new_name, t.name || ' (copy)'), t.source_filename, t.id
  FROM public.templates t
  WHERE t.id = source_id
  RETURNING id INTO new_id;

  IF new_id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  WITH new_sections AS (
    INSERT INTO public.sections (template_id, name, position)
    SELECT new_id, s.name, s.position FROM public.sections s WHERE s.template_id = source_id
    ORDER BY s.position
    RETURNING id, position
  ), mapped_sections AS (
    SELECT o.id AS old_id, n.id AS new_sid
    FROM (SELECT id, row_number() OVER (ORDER BY position, id) rn FROM public.sections WHERE template_id = source_id) o
    JOIN (SELECT id, row_number() OVER (ORDER BY position, id) rn FROM new_sections) n ON n.rn = o.rn
  ), new_items AS (
    INSERT INTO public.items (section_id, name, position)
    SELECT m.new_sid, i.name, i.position
    FROM public.items i JOIN mapped_sections m ON m.old_id = i.section_id
    RETURNING id, section_id, position
  ), mapped_items AS (
    SELECT o.id AS old_id, n.id AS new_iid
    FROM (
      SELECT i.id, row_number() OVER (ORDER BY m.new_sid, i.position, i.id) rn
      FROM public.items i JOIN mapped_sections m ON m.old_id = i.section_id
    ) o
    JOIN (SELECT id, row_number() OVER (ORDER BY section_id, position, id) rn FROM new_items) n ON n.rn = o.rn
  )
  INSERT INTO public.comments (item_id, name, body_html, position)
  SELECT mi.new_iid, c.name, c.body_html, c.position
  FROM public.comments c JOIN mapped_items mi ON mi.old_id = c.item_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.duplicate_template(UUID, TEXT) TO authenticated;