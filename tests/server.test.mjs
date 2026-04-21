import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

import { createStaticServer } from "../server.mjs";

const workspaceRoot = new URL("../", import.meta.url);
const indexHtmlUrl = new URL("index.html", workspaceRoot);

function createSilentLogger() {
  return {
    error() {},
    log() {},
  };
}

async function startTestServer() {
  const server = createStaticServer({
    logger: createSilentLogger(),
    rootDir: fileURLToPath(workspaceRoot),
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectPromise);
      resolvePromise();
    });
  });

  return server;
}

function getServerOrigin(server) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function getServerPort(server) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}

function requestPath(origin, path, { method = "GET" } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpRequest(`${origin}${path}`, { method }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolvePromise({
          body,
          headers: response.headers,
          statusCode: response.statusCode,
        });
      });
    });

    request.on("error", rejectPromise);
    request.end();
  });
}

function requestRawPath(port, path, { method = "GET" } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let rawResponse = "";
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(
        `${method} ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
      );
    });

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      rawResponse += chunk;
    });
    socket.on("end", () => {
      const [rawHeaders = "", body = ""] = rawResponse.split("\r\n\r\n");
      const headerLines = rawHeaders.split("\r\n");
      const statusLine = headerLines[0] ?? "";
      const statusCode = Number.parseInt(statusLine.split(" ")[1] ?? "", 10);
      const isChunked = headerLines.some((line) => /^transfer-encoding:\s*chunked$/i.test(line));

      resolvePromise({
        body: isChunked ? decodeChunkedBody(body) : body,
        statusCode,
      });
    });
    socket.on("error", rejectPromise);
  });
}

function decodeChunkedBody(body) {
  let cursor = 0;
  let decodedBody = "";

  while (cursor < body.length) {
    const lineEndIndex = body.indexOf("\r\n", cursor);

    if (lineEndIndex === -1) {
      break;
    }

    const chunkSize = Number.parseInt(body.slice(cursor, lineEndIndex), 16);

    if (!Number.isInteger(chunkSize) || chunkSize < 0) {
      throw new Error("Invalid chunked response body.");
    }

    if (chunkSize === 0) {
      break;
    }

    const chunkStartIndex = lineEndIndex + 2;
    const chunkEndIndex = chunkStartIndex + chunkSize;
    decodedBody += body.slice(chunkStartIndex, chunkEndIndex);
    cursor = chunkEndIndex + 2;
  }

  return decodedBody;
}

test("createStaticServer serves the game shell and returns asset headers for HEAD requests", async (t) => {
  const server = await startTestServer();
  t.after(() => new Promise((resolvePromise) => server.close(resolvePromise)));

  const origin = getServerOrigin(server);
  const expectedHtml = await readFile(indexHtmlUrl, "utf8");

  const shellResponse = await fetch(`${origin}/`);

  assert.equal(shellResponse.status, 200);
  assert.match(shellResponse.headers.get("content-type") ?? "", /^text\/html/i);
  assert.equal(await shellResponse.text(), expectedHtml);

  const headResponse = await fetch(`${origin}/src/main.js`, {
    method: "HEAD",
  });

  assert.equal(headResponse.status, 200);
  assert.match(headResponse.headers.get("content-type") ?? "", /^text\/javascript/i);
  assert.equal(await headResponse.text(), "");
});

test("createStaticServer rejects unsupported methods, missing files, and path traversal", async (t) => {
  const server = await startTestServer();
  t.after(() => new Promise((resolvePromise) => server.close(resolvePromise)));

  const origin = getServerOrigin(server);
  const port = getServerPort(server);

  const methodNotAllowedResponse = await requestPath(origin, "/", {
    method: "POST",
  });
  const missingFileResponse = await requestPath(origin, "/missing-file.js");
  const forbiddenResponse = await requestRawPath(port, "/%2e%2e/README.md");

  assert.equal(methodNotAllowedResponse.statusCode, 405);
  assert.equal(methodNotAllowedResponse.headers.allow, "GET, HEAD");
  assert.equal(methodNotAllowedResponse.body, "Method not allowed.");

  assert.equal(missingFileResponse.statusCode, 404);
  assert.equal(missingFileResponse.body, "Not found.");

  assert.equal(forbiddenResponse.statusCode, 403);
  assert.equal(forbiddenResponse.body, "Forbidden.");
});
