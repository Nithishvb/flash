import { Command } from "commander";

import http from "http";

const hostname = "localhost";
const port = 6000;

const program = new Command();

program
  .name("flash")
  .description("Start React dev server")
  .action((options) => {
    console.log("Starting Flash Dev Server...", options);

    const server = http.createServer((req, res) => {
      // Log the request in the terminal for debugging
      console.log(`Request received: ${req.method} ${req.url}`);

      // Handle the root route
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Hello, World!\n"); // Send response to the browser
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found\n");
      }
    });

    server.listen(port, hostname, () => {
      console.log(`Server running at http://${hostname}:${port}/`);
    });
  });

export default program;
