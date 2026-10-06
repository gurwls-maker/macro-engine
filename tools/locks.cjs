"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");

const validPid = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
function snapshot(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 4096) return null;
  const fd = fs.openSync(file, "r");
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== stat.dev || opened.ino !== stat.ino) return null;
    const text = fs.readFileSync(fd, "utf8");
    const after = fs.fstatSync(fd);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) return null;
    return { stat, text };
  } finally { fs.closeSync(fd); }
}
function owner(text, kind) {
  if (kind === "write") {
    if (!/^[1-9]\d{0,9}\n?$/.test(text)) return null;
    const ownerPid = Number(text.trim());
    return validPid(ownerPid) ? { ownerPid } : null;
  }
  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== "object" || !validPid(value.ownerPid)
      || (value.childPid !== null && !validPid(value.childPid))
      || typeof value.nonce !== "string" || !/^[a-zA-Z0-9-]{16,128}$/.test(value.nonce)
      || typeof value.jobId !== "string" || !/^[a-f0-9]{32}$/.test(value.jobId)) return null;
    return { ownerPid: value.ownerPid, childPid: value.childPid, nonce: value.nonce, jobId: value.jobId };
  } catch { return null; }
}
function probe(pid) {
  try { process.kill(pid, 0); return "alive"; }
  catch (error) { return error.code === "ESRCH" ? "exited" : "unknown"; }
}
function describe(value, kind) {
  const record = value && owner(value.text, kind);
  if (!record) return { state: "unknown" };
  const states = [probe(record.ownerPid)];
  if (kind === "ai") states.push(record.childPid === null ? "unknown" : probe(record.childPid));
  const state = states.includes("alive") ? "held" : states.every(value => value === "exited") ? "exited" : "unknown";
  return { state, ...record };
}
function inspect(file, { kind = "write" } = {}) {
  try { return describe(snapshot(file), kind); }
  catch (error) { return { state: error.code === "ENOENT" ? "absent" : "unknown" }; }
}
function sameSnapshot(file, previous) {
  const current = snapshot(file);
  return current && current.stat.dev === previous.stat.dev && current.stat.ino === previous.stat.ino
    && current.stat.size === previous.stat.size && current.stat.mtimeMs === previous.stat.mtimeMs
    && current.stat.ctimeMs === previous.stat.ctimeMs && current.text === previous.text;
}
function release(file, fd) {
  let owned = false;
  try { const current = fs.lstatSync(file), opened = fs.fstatSync(fd); owned = current.isFile() && !current.isSymbolicLink() && current.dev === opened.dev && current.ino === opened.ino; } catch {}
  try { fs.closeSync(fd); }
  finally { if (owned) { try { fs.unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") throw error; } } }
}
function recover(file, kind) {
  // Serialize reclamation so another recovering process cannot remove a newly acquired lock.
  const guard = `${file}.recovery`;
  let fd;
  try { fd = fs.openSync(guard, "wx"); }
  catch { return false; }
  try {
    fs.writeFileSync(fd, JSON.stringify({ ownerPid: process.pid, nonce: crypto.randomUUID() }));
    let previous;
    try { previous = snapshot(file); }
    catch (error) { return error.code === "ENOENT"; }
    if (describe(previous, kind).state !== "exited" || !sameSnapshot(file, previous)) return false;
    fs.unlinkSync(file);
    return true;
  } finally { release(guard, fd); }
}
function acquire(file, { kind = "write" } = {}) {
  if (!["write", "ai"].includes(kind)) throw new TypeError("Unknown lock kind.");
  try { return fs.openSync(file, "wx"); }
  catch (error) {
    if (error.code !== "EEXIST" || !recover(file, kind)) throw error;
    return fs.openSync(file, "wx");
  }
}
module.exports = { acquire, release, inspect };
