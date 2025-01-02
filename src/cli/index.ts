import { Command } from "commander";
import http from "http";
import { build } from "esbuild";
import path from "path";
import fs from "fs";

const hostname = "localhost";
const port = 5000;
const TARGET_DIR = path.join(process.cwd(), "flash-demo-app");

const program = new Command();

program
  .name("flash")
  .description("Start React dev server")
  .action(() => {
    console.log("Starting Flash Dev Server...");

    const server = http.createServer(async (req, res) => {
      console.log(`Request received: ${req.method} ${req.url}`);

      await preBundleDependencies();

      if (req.url === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }

      const initialHtmlTemplate = path.join(TARGET_DIR, "index.html");

      if (req.url === "/") {
        fs.readFile(
          initialHtmlTemplate,
          "utf8",
          (err: NodeJS.ErrnoException | null, data: string) => {
            if (err) {
              console.error("Error reading file:", err);
              res.writeHead(500, { "Content-Type": "text/plain" });
              res.end("Internal Server Error");
              return;
            }

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
          }
        );
        return;
      } else {
        if (req.url) {
          const filePath = path.join(TARGET_DIR, req.url);

          // Serve directly if the request is for node_modules
          if (req.url.includes("node_modules")) {
            if (fs.existsSync(filePath)) {

              const result = await build({
                entryPoints: [filePath],
                bundle: false,
                write: false,
                loader: { ".js": "jsx" },
                format: "esm",
                platform: "browser",
              });

              res.writeHead(200, { "Content-Type": "application/javascript" });
              res.end(result);
            } else {
              res.writeHead(404, { "Content-Type": "text/plain" });
              res.end("File not found");
            }
            return;
          }

          // Process user source files with esbuild
          const result = await build({
            entryPoints: [filePath],
            bundle: false,
            write: false,
            loader: {
              ".js": "jsx",
              ".ts": "ts",
              ".tsx": "tsx",
            },
            format: "esm",
          });

          // Rewrite bare imports for user source files
          const modifiedCode = await rewriteBareImports(result.outputFiles[0].text);

          res.writeHead(200, { "Content-Type": "application/javascript" });
          res.end(modifiedCode);
        }
      }
    });

    server.listen(port, hostname, () => {
      console.log(`Server running at http://${hostname}:${port}/`);
    });
  });

export default program;

async function rewriteBareImports(code: string) {
  if (code) {
    const updatedCode = code.replace(
      /from\s+["']([^./][^"']*)["']/g,
      (match, packageName) => {
        console.log("Matched import", match);
        let resolvedPath = path.join(TARGET_DIR, "node_modules", packageName);

        if (packageName === "react") {
          return `from "/node_modules/react/cjs/react.development.js"`;
        }
        if (packageName === "react-dom") {
          return `from "/node_modules/react-dom/cjs/react-dom.development.js"`;
        }

        if (!fs.existsSync(resolvedPath)) {
          resolvedPath = `${resolvedPath}.js`;
        }

        const stats = fs.statSync(resolvedPath);

        if (fs.existsSync(resolvedPath)) {
          if (stats.isDirectory()) {
            return `from "/node_modules/${packageName}/index.js"`;
          }
          return `from "/node_modules/${packageName}.js"`;
        }
        console.log("operatijm ended");
        throw new Error(`Package ${packageName} not found`);
      }
    );
    return updatedCode;
  }
}

async function preBundleDependencies() {
  await build({
    entryPoints: [path.join(TARGET_DIR, "node_modules", "react")],
    outdir: path.join(TARGET_DIR, "node_modules/.flash/deps"),
    bundle: true,
    format: "esm",
    platform: "browser",
  });
}