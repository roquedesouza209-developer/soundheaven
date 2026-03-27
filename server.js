const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1";
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATABASE_PATH = path.join(DATA_DIR, "soundheaven.db");
const MAX_BODY_SIZE = 16 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

const database = new DatabaseSync(DATABASE_PATH);

database.exec(`
  CREATE TABLE IF NOT EXISTS support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const insertSupportRequest = database.prepare(`
  INSERT INTO support_requests (email, message, created_at)
  VALUES (?, ?, ?)
`);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";

  return fsp
    .readFile(filePath)
    .then((content) => {
      response.writeHead(200, { "Content-Type": contentType });
      response.end(content);
    })
    .catch((error) => {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      console.error("Failed to serve file:", error);
      sendJson(response, 500, { error: "Unable to load the requested resource." });
    });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON payload."));
      }
    });

    request.on("error", reject);
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMessage(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateSupportRequest(payload) {
  const email = normalizeEmail(payload.email);
  const message = normalizeMessage(payload.message);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email) {
    return { ok: false, error: "Email is required." };
  }

  if (!emailPattern.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  if (!message) {
    return { ok: false, error: "Message is required." };
  }

  if (message.length < 10) {
    return { ok: false, error: "Message must be at least 10 characters long." };
  }

  if (message.length > 1000) {
    return { ok: false, error: "Message must be 1000 characters or fewer." };
  }

  return {
    ok: true,
    value: {
      email,
      message,
    },
  };
}

async function handleSupportRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const validation = validateSupportRequest(payload);

    if (!validation.ok) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    insertSupportRequest.run(
      validation.value.email,
      validation.value.message,
      new Date().toISOString()
    );

    sendJson(response, 201, {
      message: "Support request sent successfully. We will be in touch soon.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const statusCode =
      message === "Invalid JSON payload." || message === "Request body too large." ? 400 : 500;

    if (statusCode === 500) {
      console.error("Failed to save support request:", error);
    }

    sendJson(response, statusCode, { error: message });
  }
}

function resolveStaticPath(urlPathname) {
  const normalizedPath = decodeURIComponent(urlPathname || "/");
  const withoutLeadingSlash = normalizedPath.replace(/^[/\\]+/, "");
  const safePath = path.normalize(withoutLeadingSlash || "index.html");
  return path.join(PUBLIC_DIR, safePath);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);

  if (request.method === "POST" && url.pathname === "/api/support") {
    await handleSupportRequest(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const filePath = resolveStaticPath(url.pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  await sendFile(response, filePath);
});

function startServer() {
  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`SoundHeaven is live at http://${HOST}:${PORT}`);
      console.log(`Support requests database: ${DATABASE_PATH}`);
      resolve();
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  server,
  startServer,
  database,
  DATABASE_PATH,
};
