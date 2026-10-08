// The only place that knows about the tilesets. To switch to LimeZu (or another pack),
// change the files, the tile size and the frame indices below.

export const TILE = 16;

export const SHEETS = {
  indoor: { key: 'indoor', url: 'assets/kenney/indoor.png', spacing: 1 },
  chars: { key: 'chars', url: 'assets/kenney/chars.png', spacing: 1 },
} as const;

// Kenney "Roguelike Indoors" (27 columns)
export const F = {
  tableL: 0,
  tableM: 1,
  tableR: 2,
  chairFront: 54,
  chairBack: 55,
  officeChair: 216,
  plant: 16,
  plantSmall: 17,
  bookshelfL: 478,
  bookshelfM: 479,
  bookshelfR: 480,
  server: 471,
  serverAlt: 472,
  stove: 392, // coffee machine :)
};

// Kenney "Roguelike Characters" (54 columns): pre-assembled characters
export const DEV_SPRITES = [270, 324, 325, 378, 379, 432, 433, 486, 540];
export const PO_SPRITE = 271;
export const TL_SPRITES = [541, 487];
