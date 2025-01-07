import { Command } from "commander";
import http from "http";
import { build } from "esbuild";
import path from "path";
import fs from "fs";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import mime from "mime-types";
import {
  hostname,
  imageExtensions,
  NODE_MODULES_DIR,
  port,
  TARGET_DIR,
} from "./constants";
import { startWatching } from "./watcher";
import { resolveFilePath } from "./utils";
import { bundleFile } from "./bundler";
import WebSocket from "ws";
import { initWebSocket } from "./ws";

const program = new Command();

program
  .name("flash")
  .description("Start React dev server")
  .action(() => {
    console.log("Starting Flash Dev Server...");

    startWatching();
    initWebSocket();

    const server = http.createServer(async (req, res) => {
      console.log(`Request received: ${req.method} ${req.url}`);

      if (req.url) {
        if (req.url === "/favicon.ico") {
          res.writeHead(204);
          res.end();
          return;
        }

        const initialHtmlTemplate = path.join(TARGET_DIR, "index.html");
        const filePath = path.join(TARGET_DIR, req?.url);

        const query = req.url.split("?")[1];

        // Handle requests that contain the "import" query parameter
        if (query === "import") {
          const filePath = path.join(TARGET_DIR, req.url.split("?")[0]);

          if (fs.existsSync(filePath)) {
            const fileUrl = `/${path
              .relative(TARGET_DIR, filePath)
              .replace(/\\/g, "/")}`;
            const jsResponse = `export default ${JSON.stringify(fileUrl)};`;
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(jsResponse);
            return;
          } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Asset not found");
            return;
          }
        }

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

              const content = data.replace(
                "</body>",
                `<script>
                  const ws = new WebSocket('ws://localhost:4000');
                  socket.onopen = () => {
                      console.log('WebSocket Client Connected');
                      // You can send a message after connection is established
                      socket.send('Hello Server!');
                  };

                </script></body>`
              );
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(content);
            }
          );
          return;
        }

        // Handle CSS files
        if (req.url.includes(".css")) {
          if (fs.existsSync(filePath)) {
            const cssContent = fs.readFileSync(filePath, "utf-8");
            const jsResponse = `
            const __cssContent = ${JSON.stringify(cssContent)};
            const __cssId = ${JSON.stringify(filePath)};
            (function() {
              let style = document.querySelector(\`style[data-id="\${__cssId}"]\`);
              if (!style) {
                style = document.createElement("style");
                style.setAttribute("data-id", __cssId);
                document.head.appendChild(style);
              }
              style.textContent = __cssContent;
            })();
          `;
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(jsResponse);
            return;
          }
        }

        //Handle image files
        const mimeType = mime.lookup(filePath);
        if (mimeType && mimeType.startsWith("image/")) {
          const mimeType = mime.lookup(filePath); // Get the MIME type based on file extension
          if (mimeType && mimeType.startsWith("image/")) {
            const imageFile = fs.readFileSync(filePath); // Read the binary data of the image
            res.writeHead(200, { "Content-Type": mimeType }); // Set the correct Content-Type
            res.end(imageFile); // Send the binary image data
          }
        }

        //Handle dependency files
        if (req.url && req.url.includes("node_modules")) {
          if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath);

            res.writeHead(200, {
              "Content-Type": "application/javascript",
            });
            res.end(data);
          } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("File not found");
          }
          return;
        }

        // Handle JavaScript or TypeScript files
        if (
          filePath.endsWith(".js") ||
          filePath.endsWith(".ts") ||
          filePath.endsWith(".tsx")
        ) {
          try {
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
              jsx: "automatic",
              sourcemap: "inline",
            });

            const modifiedCode = await rewriteBareImports(
              result.outputFiles[0].text
            );
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(modifiedCode);
          } catch (error) {
            console.error("Error processing JS/TS file:", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
          }
          return;
        }
      }
    });

    server.listen(port, hostname, async () => {
      console.log(`Server running at http://${hostname}:${port}/`);
      // await preBundleReactDependencies();
    });
  });

export default program;

async function rewriteBareImports(code: string) {
  const ast = parse(code, {
    sourceType: "module", // Treat as an ES module
    plugins: ["jsx"], // Add support for JSX if needed
  });

  traverse(ast, {
    ImportDeclaration(path) {
      const importPath = path.node.source.value;

      const splitImportPath = importPath.split(".");

      const cachedDepsPath = `${NODE_MODULES_DIR}/.flash/deps`;

      if (importPath === "react-dom/client") {
        // Generate a new unique import variable
        const importVariableName = "__flash_import_reactDom_client";

        // Replace the import path with the pre-bundled path
        const preBundledPath = `/node_modules/.flash/deps/react-dom_client.js`;
        path.node.source.value = preBundledPath;

        // Rewrite the import to a default import
        path.node.specifiers = [
          t.importDefaultSpecifier(t.identifier(importVariableName)),
        ];

        // Add a new variable declaration for `createRoot`
        const createRootDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("createRoot"),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral("createRoot"),
              true // Computed property
            )
          ),
        ]);

        // Insert the variable declaration after the import statement
        path.insertAfter(createRootDeclaration);
      }
      if (importPath === "react") {
        const importVariableName = "__flash_import_react";
        const preBundledPath = `/node_modules/.flash/deps/react.js`;
        path.node.source.value = preBundledPath;

        path.node.specifiers.forEach((specifier) => {
          // Rewrite the import to a default import
          if (t.isImportSpecifier(specifier)) {
            path.node.specifiers = [
              t.importDefaultSpecifier(t.identifier(importVariableName)),
            ];

            // Add a new variable declaration for `StrictMode`
            const strictModeDeclaration = t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(specifier.local.name),
                t.memberExpression(
                  t.identifier(importVariableName),
                  t.stringLiteral(specifier.local.name),
                  true // Computed property
                )
              ),
            ]);

            path.insertAfter(strictModeDeclaration);
          } else {
            path.node.specifiers = [
              t.importDefaultSpecifier(t.identifier(specifier.local.name)),
            ];
          }
        });
      }

      if (importPath === "react/jsx-runtime") {
        const preBundledPath = `/node_modules/.flash/deps/react_jsx-runtime.js`;
        path.node.source.value = preBundledPath;

        // Generate a new unique import variable
        const importVariableName = "__flash_import_reactRuntime";

        // Rewrite the import to a default import
        path.node.specifiers = [
          t.importDefaultSpecifier(t.identifier(importVariableName)),
        ];

        // Add a new variable declaration for `createRoot`
        const createRootDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("Fragment"),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral("Fragment"),
              true // Computed property
            )
          ),
        ]);

        const createJsxDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("jsx"),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral("jsx"),
              true // Computed property
            )
          ),
        ]);

        const createJsxsDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("jsxs"),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral("jsxs"),
              true // Computed property
            )
          ),
        ]);

        // Insert the variable declaration after the import statement
        path.insertAfter(createRootDeclaration);
        path.insertAfter(createJsxDeclaration);
        path.insertAfter(createJsxsDeclaration);
      }

      //Insert import for the assets import statements
      if (splitImportPath.length > 0) {
        const result = imageExtensions.includes(
          splitImportPath[splitImportPath.length - 1]
        );
        if (result) {
          path.node.source.value = `${importPath}?import`;
        }
      }

      //handle dependency modules imports
      if (!importPath.includes("react") && !importPath.includes("./")) {
        const checkDepsPath = `${cachedDepsPath}/${importPath}.js`;

        if (fs.readFileSync(checkDepsPath)) {
          path.node.source.value = `/node_modules/.flash/deps/${importPath}.js`;

          // Generate a new unique import variable
          const importVariableName = `__flash_${importPath}_import`;

          path.node.specifiers.forEach((specifier) => {
            if (t.isImportDefaultSpecifier(specifier)) {
              path.node.specifiers = [
                t.importDefaultSpecifier(t.identifier(specifier.local.name)),
              ];
            } else {
              const createDepsDeclaration = t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier(specifier.local.name),
                  t.memberExpression(
                    t.identifier(importVariableName),
                    t.stringLiteral(specifier.local.name),
                    true // Computed property
                  )
                ),
              ]);
              path.insertAfter(createDepsDeclaration);
            }
          });
        }
      }
    },
  });

  // Generate updated code
  const { code: updatedCode } = generate(ast);
  return updatedCode;
}

async function preBundleDependencies() {
  const dependencies = [
    {
      name: "react",
      files: [
        "index.js",
        "cjs/react-jsx-runtime.development.js",
        "cjs/react-jsx-dev-runtime.development.js",
      ],
    },
    {
      name: "react-dom",
      files: ["index.js", "client.js", "cjs/react-dom.development.js"],
    },
  ];

  for (const dep of dependencies) {
    for (const file of dep.files) {
      const entryPoint: string | null = resolveFilePath(dep.name, file);
      if (entryPoint) {
        await bundleFile(dep.name, file, entryPoint);
      }
    }
  }
}
