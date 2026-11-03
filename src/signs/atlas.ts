import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from "three";
import { LINE_GREEN } from "../shared/palette";
import { STATIONS } from "../line6";
import {
  ATLAS_SIZE,
  BILLBOARDS,
  BILLBOARD_CELL,
  BOARD_CELL,
  POSTERS,
  POSTER_CELL,
  SHOP_CELL,
  SHOP_NAMES,
  billboardCell,
  boardCell,
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

function drawShop(ctx: CanvasRenderingContext2D, index: number): void {
  const [name, background, ink] = SHOP_NAMES[index]!;
  const [x, y] = shopCell(index);
  const { w, h } = SHOP_CELL;
  ctx.fillStyle = background;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitText(ctx, name, 700, BANGLA, 46, w - 36);
  ctx.fillText(name, x + w / 2, y + h / 2 + 2);
}

function drawBoard(ctx: CanvasRenderingContext2D, index: number): void {
  const station = STATIONS[index]!;
  const [x, y] = boardCell(index);
  const { w, h } = BOARD_CELL;
  const green = `#${LINE_GREEN.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = green;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x + 52, y + h / 2, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = green;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 40px ${LATIN}`;
  ctx.fillText("M", x + 52, y + h / 2 + 2);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  fitText(ctx, station.bn, 700, BANGLA, 60, 500);
  ctx.fillText(station.bn, x + 108, y + h / 2 + 3);
  ctx.textAlign = "right";
  fitText(ctx, station.en.toUpperCase(), 500, LATIN, 42, 380);
  ctx.fillText(station.en.toUpperCase(), x + w - 26, y + h / 2 + 2);
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
    document.fonts.load(`500 40px ${LATIN}`, "METRO"),
    document.fonts.load(`700 40px ${LATIN}`, "M"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  SHOP_NAMES.forEach((_, index) => drawShop(ctx, index));
  STATIONS.forEach((_, index) => drawBoard(ctx, index));
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
