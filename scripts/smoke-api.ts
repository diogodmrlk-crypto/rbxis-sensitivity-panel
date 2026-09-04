import { createServer } from "node:http";
import handler from "../api/index";

const server = createServer((req, res) => handler(req, res));
server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to inspect smoke server");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const body = await response.text();
    if (response.status !== 200 || body !== '{"ok":true,"service":"rbxis"}') {
      throw new Error(`Unexpected health response: ${response.status} ${body}`);
    }
    console.log("Vercel handler health smoke test passed");
  } finally {
    server.close();
  }
});
