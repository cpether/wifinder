import { HttpError } from "./errors.js";

export function send(res, statusCode, body, contentType, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "content-type": contentType,
    ...extraHeaders
  });
  res.end(body);
}

export function json(res, statusCode, body, extraHeaders = {}) {
  send(res, statusCode, JSON.stringify(body), "application/json; charset=utf-8", extraHeaders);
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}
