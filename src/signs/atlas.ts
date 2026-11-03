import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from "three";
import {
  ATLAS_SIZE,
  BILLBOARDS,
  BILLBOARD_CELL,
  POSTERS,
  POSTER_CELL,
  SHOP_CELL,
  SHOP_SIGNS,
  PIER_PLATE,
  TRAIN_PRINT,
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

function ringSign(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, draw: () => void): void {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  draw();
  ctx.strokeStyle = "#c8261f";
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
  ctx.moveTo(x - r * 0.62, y - r * 0.62);
  ctx.lineTo(x + r * 0.62, y + r * 0.62);
  ctx.stroke();
}

/** Line 6's print, in its real colours: the train is the one thing in the world that keeps them. */
function drawTrainPrint(ctx: CanvasRenderingContext2D): void {
  const P = TRAIN_PRINT;
  ctx.textBaseline = "middle";
  // The red sign that marks the women's coach at the stations.
  ctx.fillStyle = "#c2243a";
  ctx.fillRect(P.women.x, P.women.y, P.women.w, P.women.h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = `700 26px ${BANGLA}`;
  ctx.fillText("মহিলা কোচ", P.women.x + P.women.w / 2, P.women.y + 22);
  ctx.font = `600 18px ${LATIN}`;
  ctx.fillText("Women Coach", P.women.x + P.women.w / 2, P.women.y + 48);
  // Amber on black: the destination display over the windscreen.
  ctx.fillStyle = "#0c0d0e";
  ctx.fillRect(P.destination.x, P.destination.y, P.destination.w, P.destination.h);
  ctx.fillStyle = "#f2a62c";
  ctx.font = `700 26px ${BANGLA}`;
  ctx.fillText("মতিঝিল", P.destination.x + P.destination.w / 2, P.destination.y + 22);
  ctx.font = `600 18px ${LATIN}`;
  ctx.fillText("Motijheel", P.destination.x + P.destination.w / 2, P.destination.y + 48);
  // The set's number, white in the corner of the windscreen.
  ctx.fillStyle = "#1f2b30";
  ctx.fillRect(P.number.x, P.number.y, P.number.w, P.number.h);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 38px ${LATIN}`;
  ctx.fillText("008", P.number.x + P.number.w / 2, P.number.y + 33);
  // The line on the door-top screens.
  ctx.fillStyle = "#101416";
  ctx.fillRect(P.route.x, P.route.y, P.route.w, P.route.h);
  ctx.fillStyle = "#1fa56f";
  ctx.fillRect(P.route.x + 18, P.route.y + 28, P.route.w - 36, 7);
  for (let i = 0; i < 16; i++) {
    const x = P.route.x + 18 + ((P.route.w - 36) * i) / 15;
    ctx.fillStyle = i === 9 ? "#f2a62c" : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, P.route.y + 31, i === 9 ? 8 : 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = `500 14px ${BANGLA}`;
  ctx.textAlign = "left";
  ctx.fillText("উত্তরা উত্তর", P.route.x + 10, P.route.y + 52);
  ctx.textAlign = "right";
  ctx.fillText("মতিঝিল", P.route.x + P.route.w - 10, P.route.y + 52);
  ctx.textAlign = "center";
  // Long adverts over the windows, parodies of what really hangs there.
  const adverts = [
    [P.advert0, "#c8261f", "#ffffff", "শনি ৪.৫জি সুপারনেট", "শনিবার ছাড়া সব বারে চলে"],
    [P.advert1, "#f6f2e6", "#0f5c3a", "দুঃস্বপ্ন সুপারশপ", "ট্রেন থেকে নেমেই, দাম দেখে আবার উঠে পড়ুন"],
    [P.advert2, "#1f3f7a", "#ffe14d", "বাকি অ্যাপে ক্যাশব্যাক", "টাকা নাই? সমস্যা নাই"],
    [P.advert3, "#0f6b4a", "#ffffff", "উদ্ভট কোচিংয়ে ভর্তি চলছে", "ভর্তি হতে ভর্তি পরীক্ষা নাই"],
  ] as const;
  for (const [cell, ground, ink, title, line] of adverts) {
    ctx.fillStyle = ground;
    ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
    ctx.fillStyle = ink;
    fitText(ctx, title, 700, BANGLA, 26, cell.w - 30);
    ctx.fillText(title, cell.x + cell.w / 2, cell.y + 19);
    fitText(ctx, line, 500, BANGLA, 15, cell.w - 40);
    ctx.fillText(line, cell.x + cell.w / 2, cell.y + 43);
  }
  // Stickers by the doors.
  ringSign(ctx, P.noSmoking.x + 32, P.noSmoking.y + 32, 30, () => {
    ctx.fillStyle = "#17181a";
    ctx.fillRect(P.noSmoking.x + 14, P.noSmoking.y + 28, 36, 8);
  });
  ctx.fillStyle = "#17813f";
  ctx.fillRect(P.exit.x, P.exit.y, P.exit.w, P.exit.h);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 22px ${LATIN}`;
  ctx.fillText("EXIT →", P.exit.x + P.exit.w / 2, P.exit.y + 33);
  ctx.fillStyle = "#274f9b";
  ctx.fillRect(P.priority.x, P.priority.y, P.priority.w, P.priority.h);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 19px ${BANGLA}`;
  ctx.fillText("সংরক্ষিত আসন", P.priority.x + P.priority.w / 2, P.priority.y + 22);
  ctx.font = `500 13px ${BANGLA}`;
  ctx.fillText("বয়স্ক ও গর্ভবতী", P.priority.x + P.priority.w / 2, P.priority.y + 46);
  ctx.fillStyle = "#274f9b";
  ctx.fillRect(P.wheelchair.x, P.wheelchair.y, P.wheelchair.w, P.wheelchair.h);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(P.wheelchair.x + 29, P.wheelchair.y + 41, 13, 0.3, Math.PI * 1.7);
  ctx.moveTo(P.wheelchair.x + 27, P.wheelchair.y + 16);
  ctx.lineTo(P.wheelchair.x + 30, P.wheelchair.y + 38);
  ctx.lineTo(P.wheelchair.x + 46, P.wheelchair.y + 38);
  ctx.lineTo(P.wheelchair.x + 50, P.wheelchair.y + 52);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(P.wheelchair.x + 27, P.wheelchair.y + 10, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0efe9";
  ctx.fillRect(P.doorPlate.x, P.doorPlate.y, P.doorPlate.w, P.doorPlate.h);
  ctx.fillStyle = "#17181a";
  ctx.font = `600 20px ${LATIN}`;
  ctx.fillText("A3", P.doorPlate.x + P.doorPlate.w / 2, P.doorPlate.y + 17);
  ctx.fillStyle = "#c8261f";
  ctx.fillRect(P.fire.x, P.fire.y, P.fire.w, P.fire.h);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(P.fire.x + 32, P.fire.y + 8);
  ctx.bezierCurveTo(P.fire.x + 56, P.fire.y + 34, P.fire.x + 46, P.fire.y + 56, P.fire.x + 32, P.fire.y + 56);
  ctx.bezierCurveTo(P.fire.x + 16, P.fire.y + 56, P.fire.x + 10, P.fire.y + 36, P.fire.x + 32, P.fire.y + 8);
  ctx.fill();
  // Pier numbers: black stencil on a white plate.
  for (let i = 0; i < PIER_PLATE.count; i++) {
    const x = PIER_PLATE.x + i * PIER_PLATE.w;
    ctx.fillStyle = "#f4f3ec";
    ctx.fillRect(x + 1, PIER_PLATE.y + 1, PIER_PLATE.w - 2, PIER_PLATE.h - 2);
    ctx.fillStyle = "#17181a";
    ctx.font = `600 22px ${LATIN}`;
    ctx.fillText(`P${512 + i * 37}`, x + PIER_PLATE.w / 2, PIER_PLATE.y + 17);
  }
}

/** Paints the atlas once the Bangla font has loaded. Canvas shapes the conjuncts correctly. */
export async function createAtlas(maxAnisotropy: number): Promise<CanvasTexture> {
  await Promise.all([
    document.fonts.load(`700 40px ${BANGLA}`, "ঢাকা মেট্রো"),
    document.fonts.load(`400 20px ${BANGLA}`, "ঢাকা মেট্রো"),
    document.fonts.load(`500 16px ${BANGLA}`, "ঢাকা মেট্রো"),
    document.fonts.load(`500 40px ${LATIN}`, "METRO"),
    document.fonts.load(`600 22px ${LATIN}`, "P529 Women Coach"),
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
  drawTrainPrint(ctx);
  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = maxAnisotropy;
  return texture;
}
