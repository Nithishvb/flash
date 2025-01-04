import chokidar from "chokidar";
import { NODE_MODULES_DIR } from "./constants";
import { bundlePackage } from "./bundler";
import fs from "fs";
import path from "path";

const watcher = chokidar.watch(NODE_MODULES_DIR, { ignoreInitial: true });

export function startWatching() {
  watcher.on("addDir", async (dirPath) => {
    const relativePath = path.relative(NODE_MODULES_DIR, dirPath);
    const packageName = relativePath.split(path.sep)[0];

    // Skip already processed packages
    if (
      fs.existsSync(
        path.join(NODE_MODULES_DIR, ".flash", "deps", `${packageName}.js`)
      )
    ) {
      return;
    }

    await bundlePackage(packageName);
  });
}
