import chokidar from "chokidar";
import { NODE_MODULES_DIR, SOURCE_DIR } from "./constants";
import { bundlePackage } from "./bundler";
import fs from "fs";
import path from "path";
import { debounce } from "lodash";

const nodeWatcher = chokidar.watch(NODE_MODULES_DIR, { ignoreInitial: true });
const srcWatcher = chokidar.watch(SOURCE_DIR, { ignoreInitial: true });

const handleAddDir = debounce(async (dirPath) => {
  const relativePath = path.relative(NODE_MODULES_DIR, dirPath);
  const packageName = relativePath.split(path.sep)[0];

  if (
    fs.existsSync(
      path.join(NODE_MODULES_DIR, ".flash", "deps", `${packageName}.js`)
    )
  ) {
    return;
  }

  try {
    await bundlePackage(packageName);
  } catch (error) {
    console.error(`Error bundling package ${packageName}:`, error);
  }
}, 200);


export function startWatching() {
  nodeWatcher.on("addDir", async (dirPath) => {
    handleAddDir(dirPath);
  });

  srcWatcher.on("change", (filePath) => {
    console.log("file_path", filePath);
    // debounce(() => {
    //   broadcastChange(filePath);
    // }, 200);
  });
}
