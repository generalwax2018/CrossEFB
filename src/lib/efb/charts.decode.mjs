import { parentPort } from "node:worker_threads";
import { fromFile } from "geotiff";

const port = parentPort;
if (!port) throw new Error("chart decoder must run as a worker");

port.on("message", async (msg) => {
  try {
    const tiff = await fromFile(msg.file);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const src = rasters[0];
    const pixels = src instanceof Uint8Array ? new Uint8Array(src) : new Uint16Array(src);
    port.postMessage({ id: msg.id, pixels }, [pixels.buffer]);
  } catch (err) {
    port.postMessage({ id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
});
