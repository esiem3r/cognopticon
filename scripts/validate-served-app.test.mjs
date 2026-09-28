import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertBuiltAppServed } from "./validate-served-app.mjs";

let server;
let baseUrl;
let routes;

describe("served app validation", () => {
  beforeEach(async () => {
    routes = new Map([
      ["/", { status: 200, body: '<title>Cognopticon</title><script src="/assets/app.js"></script><link href="/assets/style.css"><link href="/assets/helper.js">' }],
      ["/assets/app.js", { status: 200, body: `console.log("${"demo ".repeat(30)}");` }],
      ["/assets/style.css", { status: 200, body: `body { color: white; } /* ${"demo ".repeat(30)} */` }],
      ["/assets/helper.js", { status: 200, body: "export const identity = value => value;\n" }]
    ]);
    server = createServer((request, response) => {
      const route = routes.get(request.url) ?? { status: 404, body: "Missing asset" };
      response.writeHead(route.status);
      response.end(route.body);
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("accepts a served nonempty runtime helper smaller than 100 bytes", async () => {
    await expect(assertBuiltAppServed(baseUrl)).resolves.toBeUndefined();
  });

  it("rejects an empty asset even with a successful status", async () => {
    routes.set("/assets/helper.js", { status: 200, body: "" });
    await expect(assertBuiltAppServed(baseUrl)).rejects.toThrow("daemon asset /assets/helper.js should not be empty");
  });

  it("rejects missing assets even when their error response has a body", async () => {
    routes.delete("/assets/helper.js");
    await expect(assertBuiltAppServed(baseUrl)).rejects.toThrow("daemon asset /assets/helper.js returned 404");
  });
});
