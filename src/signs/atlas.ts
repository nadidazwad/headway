import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from "three";
import {
  ATLAS_SIZE,
  BILLBOARDS,
  BILLBOARD_CELL,
  POSTERS,
  POSTER_CELL,
  SHOP_CELL,
  SHOP_SIGNS,
  billboardCell,
  posterCell,
  shopCell,
} from "./regions";

const BANGLA = '"Noto Sans Bengali", sans-serif';
const LATIN = '"IBM Plex Mono", monospace';

function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, family: string, size: number, maxWidth: number): void {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && px > 8) {
    px -= 1;
    ctx.font = `${weight} ${px}px ${family}`;
  }
}

/** The boards of a Dhaka street, in the city's greys: every scheme still reads when it is small. */
const BOARDS = [
  ["#17181a", "#ffffff"],
  ["#f6f5ee", "#121315"],
  ["#3a3b3e", "#ffffff"],
  ["#dcdad0", "#17181a"],
  ["#262729", "#f2f0e6"],
] as const;

function drawShop(ctx: CanvasRenderingContext2D, index: number): void {
  const [, name, line] = SHOP_SIGNS[index]!;
  const [x, y] = shopCell(index);
  const { w, h } = SHOP_CELL;
  const [background, ink] = BOARDS[(index * 7 + (index >> 2)) % BOARDS.length]!;
  ctx.fillStyle = background;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitText(ctx, name, 700, BANGLA, 40, w - 30);
  ctx.fillText(name, x + w / 2, y + 28);
  fitText(ctx, line, 500, BANGLA, 16, w - 40);
  ctx.fillText(line, x + w / 2, y + 57);
}

function drawBillboard(ctx: CanvasRenderingContext2D, index: number): void {
  const [title, line, background, ink] = BILLBOARDS[index]!;
  const [x, y] = billboardCell(index);
  const { w, h } = BILLBOARD_CELL;
  ctx.fillStyle = background;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitText(ctx, title, 700, BANGLA, 66, w - 40);
  ctx.fillText(title, x + w / 2, y + h * 0.42);
  fitText(ctx, line, 400, BANGLA, 32, w - 60);
  ctx.fillText(line, x + w / 2, y + h * 0.76);
}

function drawPoster(ctx: CanvasRenderingContext2D, index: number): void {
  const [title, line, background, ink] = POSTERS[index]!;
  const [x, y] = posterCell(index);
  const { w, h } = POSTER_CELL;
  ctx.fillStyle = background;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitText(ctx, title, 700, BANGLA, 28, w - 12);
  ctx.fillText(title, x + w / 2, y + h * 0.34);
  fitText(ctx, line, 400, BANGLA, 14, w - 12);
  ctx.fillText(line, x + w / 2, y + h * 0.62);
  ctx.fillRect(x + 22, y + h * 0.78, w - 44, 3);
}

/** Paints the atlas once the Bangla font has loaded. Canvas shapes the conjuncts correctly. */
export async function createAtlas(maxAnisotropy: number): Promise<CanvasTexture> {
  await Promise.all([
    document.fonts.load(`700 40px ${BANGLA}`, "ঢাকা মেট্রো"),
    document.fonts.load(`400 20px ${BANGLA}`, "ঢাকা মেট্রো"),
    document.fonts.load(`500 16px ${BANGLA}`, "ঢাকা মেট্রো"),
    document.fonts.load(`500 40px ${LATIN}`, "METRO"),
    document.fonts.load(`700 40px ${LATIN}`, "M"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  SHOP_SIGNS.forEach((_, index) => drawShop(ctx, index));
  BILLBOARDS.forEach((_, index) => drawBillboard(ctx, index));
  POSTERS.forEach((_, index) => drawPoster(ctx, index));
  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = maxAnisotropy;
  return texture;
}
