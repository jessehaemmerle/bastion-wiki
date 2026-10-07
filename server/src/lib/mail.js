import nodemailer from 'nodemailer';
import { getSection } from './integrations.js';
import { getSettings } from './settings.js';

let transport = null;
let transportKey = '';

async function getTransport() {
  const cfg = await getSection('smtp');
  if (!cfg.enabled || !cfg.host) return null;
  const key = JSON.stringify([cfg.host, cfg.port, cfg.secure, cfg.user, cfg.password]);
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
    transportKey = key;
  }
  return { transport, cfg };
}

export async function mailEnabled() {
  const cfg = await getSection('smtp');
  return Boolean(cfg.enabled && cfg.host);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Plain, robust HTML mail: a heading, a list of entries with links, a footer */
export function renderMail({ siteName, heading, intro, items = [], footer }) {
  const rows = items.map((i) => `<tr><td style="padding:10px 0;border-top:1px solid #e3e5e6">
      <a href="${esc(i.url)}" style="color:#1d1d1b;font-weight:600;text-decoration:none">${esc(i.title)}</a>
      <div style="color:#5c666b;font-size:13px;margin-top:2px">${esc(i.meta || '')}</div></td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f2f3f3;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #d5d8d9;border-radius:6px">
    <tr><td style="background:#2b3135;color:#fff;padding:12px 20px;font-weight:700;border-radius:6px 6px 0 0">
      <span style="background:#f2c200;color:#1d1d1b;padding:2px 6px;border-radius:2px;font-family:monospace;font-size:12px">${esc(siteName)}</span></td></tr>
    <tr><td style="padding:20px">
      <h1 style="font-size:18px;margin:0 0 6px">${esc(heading)}</h1>
      ${intro ? `<p style="color:#3c4448;margin:0 0 12px">${esc(intro)}</p>` : ''}
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      ${footer ? `<p style="color:#7a8488;font-size:12px;margin:18px 0 0">${esc(footer)}</p>` : ''}
    </td></tr>
  </table></td></tr></table></body></html>`;
  const text = [heading, intro, '', ...items.map((i) => `- ${i.title}${i.meta ? ` (${i.meta})` : ''}\n  ${i.url}`), '', footer].filter((x) => x != null).join('\n');
  return { html, text };
}

export async function sendMail({ to, subject, html, text }) {
  const t = await getTransport();
  if (!t) throw new Error('E-Mail-Versand ist nicht eingerichtet');
  const settings = await getSettings();
  const from = t.cfg.from || `${settings.siteName || 'Bastion'} <${t.cfg.user || 'bastion@localhost'}>`;
  return t.transport.sendMail({ from, to, subject, html, text });
}
