import { createServer } from "node:http";
import handler from "../api/trpc";

const server = createServer((req, res) => handler(req, res));
server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to inspect smoke server");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/trpc/auth.adminLogin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { adminKey: "Ferraodev" } }),
    });
    const body = await response.text();
    console.log(response.status, body);
    if (response.status >= 500) throw new Error("tRPC HTTP smoke test failed");
  } finally {
    server.close();
  }
});
