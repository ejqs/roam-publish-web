-- Pages now store who can read them instead of following their graph's or collection's default
-- live; the default only seeds new pages. Copy each container's current default onto its pages.
UPDATE "publication" p SET "access" = g."default_access" FROM "graph" g WHERE p."graph_id" = g."id" AND p."access" = 'inherit';--> statement-breakpoint
UPDATE "collection_entry" e SET "access" = c."default_access" FROM "collection" c WHERE e."collection_id" = c."id" AND e."access" = 'inherit';
