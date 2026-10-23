Drop your .glb files in this folder using these exact names
(they're referenced by path in js/catalog.js):

  bed.glb
  floor_lamp.glb
  flowerpot.glb
  simple_office_table.glb
  sofa.glb
  sofa_chair.glb
  wooden_book_shelf.glb

If a name doesn't match, that catalog entry falls back to a small
magenta placeholder box in both the room editor and AR mode, so
you'll immediately spot which file is missing or misnamed.

To use a different filename, edit the `file:` path for that entry
in js/catalog.js instead of renaming your export.
