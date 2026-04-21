import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = process.env.HOST ?? "127.0.0.1";
const DEFAULT_PORT = normalizePort(process.env.PORT ?? "8080");
const DEFAULT_ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".ogg", "audio/ogg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"],
]);

function normalizePort(value) {
  const parsedPort = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsedPort) || parsedPort < 0) {
    throw new TypeError(`Expected PORT to be a non-negative integer, received ${value}.`);
  }

  return parsedPort;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getContentType(filePath) {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function resolveFilePath(rootDir, requestUrl) {
  let pathname;

  try {
    const rawPathname = String(requestUrl ?? "/").split("?")[0].split("#")[0];
    pathname = decodeURIComponent(rawPathname);
  } catch (error) {
    if (error instanceof URIError) {
      throw createHttpError(400, "Malformed request URL.");
    }

    throw error;
  }

  if (!pathname.startsWith("/")) {
    throw createHttpError(400, "Malformed request URL.");
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolvedRootDir = resolve(rootDir);
  let resolvedPath = resolve(resolvedRootDir, relativePath);

  if (resolvedPath !== resolvedRootDir && !resolvedPath.startsWith(`${resolvedRootDir}${sep}`)) {
    throw createHttpError(403, "Forbidden.");
  }

  let fileStats;

  try {
    fileStats = await stat(resolvedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createHttpError(404, "Not found.");
    }

    throw error;
  }

  if (fileStats.isDirectory()) {
    resolvedPath = join(resolvedPath, "index.html");

    try {
      fileStats = await stat(resolvedPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw createHttpError(404, "Not found.");
      }

      throw error;
    }
  }

  if (!fileStats.isFile()) {
    throw createHttpError(404, "Not found.");
  }

  return resolvedPath;
}

export function createStaticServer({ rootDir = DEFAULT_ROOT_DIR, logger = console } = {}) {
  const resolvedRootDir = resolve(rootDir);

  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, {
        Allow: "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Method not allowed.");
      return;
    }

    try {
      const filePath = await resolveFilePath(resolvedRootDir, request.url);

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": getContentType(filePath),
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const fileStream = createReadStream(filePath);
      fileStream.on("error", (error) => {
        if (typeof logger?.error === "function") {
          logger.error(error);
        }

        if (!response.headersSent) {
          response.writeHead(500, {
            "Content-Type": "text/plain; charset=utf-8",
          });
          response.end("Internal server error.");
          return;
        }

        response.destroy(error);
      });
      fileStream.pipe(response);
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;

      if (statusCode === 500 && typeof logger?.error === "function") {
        logger.error(error);
      }

      response.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(statusCode === 500 ? "Internal server error." : error.message);
    }
  });
}

export function startServer({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  rootDir = DEFAULT_ROOT_DIR,
  logger = console,
} = {}) {
  const server = createStaticServer({ rootDir, logger });

  return new Promise((resolvePromise, rejectPromise) => {
    const handleError = (error) => {
      server.off("error", handleError);
      rejectPromise(error);
    };

    server.once("error", handleError);
    server.listen(port, host, () => {
      server.off("error", handleError);

      const address = server.address();
      const portNumber = typeof address === "object" && address ? address.port : port;

      if (typeof logger?.log === "function") {
        logger.log(`Serving ${rootDir} at http://${host}:${portNumber}`);
      }

      resolvePromise(server);
    });
  });
}

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
