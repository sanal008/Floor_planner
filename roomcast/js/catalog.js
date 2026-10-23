// Central list of furniture. Both custom.html and ar.html import this,
// so add or rename a piece here once and it shows up in both places.
//
// file:  path to the .glb, relative to the project root (where index.html lives)
// scale: multiply the model's native size to get real-world meters.
//        Most glb exports are already in meters (scale 1). If a model shows up
//        huge or tiny in the scene, adjust this number rather than the code.

export const CATALOG = [
  { id: 'sofa',                 label: 'Sofa',           file: 'models/sofa.glb',                 scale: 1 },
  { id: 'sofa_chair',           label: 'Armchair',       file: 'models/sofa_chair.glb',           scale: 1 },
  { id: 'simple_office_table',  label: 'Office table',   file: 'models/simple_office_table.glb',  scale: 1 },
  { id: 'bed',                  label: 'Bed',            file: 'models/bed.glb',                  scale: 1 },
  { id: 'wooden_book_shelf',    label: 'Bookshelf',      file: 'models/wooden_book_shelf.glb',    scale: 1 },
  { id: 'floor_lamp',           label: 'Floor lamp',     file: 'models/floor_lamp.glb',           scale: 1 },
  { id: 'flowerpot',            label: 'Flower pot',     file: 'models/flowerpot.glb',            scale: 1 },
];
