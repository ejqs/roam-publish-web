-- Unlisted pages start with "Show in roam.pub search" off: off for pages listed nowhere.
UPDATE "publication" p SET "searchable" = false
WHERE NOT (p."in_graph" AND p."visibility" = 'public')
  AND NOT EXISTS (SELECT 1 FROM "collection_entry" e WHERE e."publication_id" = p."id" AND e."listing" <> 'unlisted');
