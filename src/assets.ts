// Único lugar que conhece os tilesets. Pra trocar pelo LimeZu (ou outro pack),
// mude os arquivos, o tamanho do tile e os índices de frame abaixo.

export const TILE = 16;

export const SHEETS = {
  indoor: { key: 'indoor', url: 'assets/kenney/indoor.png', spacing: 1 },
  chars: { key: 'chars', url: 'assets/kenney/chars.png', spacing: 1 },
} as const;

// Kenney "Roguelike Indoors" (27 colunas)
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
  stove: 392, // máquina de café :)
};

// Kenney "Roguelike Characters" (54 colunas): personagens já montados
export const DEV_SPRITES = [270, 324, 325, 378, 379, 432, 433, 486, 540];
export const PO_SPRITE = 271;
export const TL_SPRITES = [541, 487];
