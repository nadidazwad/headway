// Draws every walk frame of every avatar from above and from the side as dots, into one PNG. Facing reads from the shape.
// usage: node tools/dev/walk-sheet.mjs out.png
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
const index = JSON.parse(readFileSync("public/people/people.json", "utf8"));
const bytes = readFileSync("public/people/people.bin");
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
const cell = 92, rows = index.avatars.length, cols = index.avatars[0].walk.length;
const png = new PNG({ width: cols * cell * 2, height: rows * cell });
png.data.fill(255);
const dot = (x, y, v) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= png.width || y >= png.height) return; const i = (y * png.width + x) * 4; png.data[i] = png.data[i + 1] = png.data[i + 2] = Math.min(png.data[i], v); };
index.avatars.forEach((avatar, r) => {
  avatar.walk.forEach((offset, c) => {
    const count = avatar.lods.lo.vertices;
    for (let v = 0; v < count; v++) {
      const o = offset + v * index.stride;
      const x = view.getInt16(o, true) / index.quant, y = view.getInt16(o + 2, true) / index.quant, z = view.getInt16(o + 4, true) / index.quant;
      // Top view: +z (the way they should face) points down the cell. Head and shoulders darkest.
      dot(cell * c * 2 + cell / 2 + x * 55, r * cell + cell / 2 + z * 55, y > 1.2 ? 0 : 150);
      // Side view: facing +z is to the right.
      dot(cell * c * 2 + cell + cell / 2 + z * 44, r * cell + cell - 4 - y * 44, 60);
    }
  });
});
writeFileSync(process.argv[2], PNG.sync.write(png));
