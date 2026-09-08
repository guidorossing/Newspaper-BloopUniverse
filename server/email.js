// Email notifications over your own mailbox.
//
// A small SMTP client on top of node:net and node:tls, so the CMS keeps its
// promise of running without dependencies. It speaks just enough of the
// protocol to send a message: greeting, EHLO, optional STARTTLS, AUTH LOGIN,
// MAIL FROM, RCPT TO, DATA, QUIT.
//
// Port 465 is implicit TLS (encrypted from the first byte); port 587 starts
// plain and upgrades with STARTTLS. Both are supported; the settings screen
// picks one. The password is stored encrypted in the vault, never in plain
// text on disk.
import net from 'node:net';
import tls from 'node:tls';
import { load } from './store.js';
import { decryptSecret } from './vault.js';

const TIMEOUT_MS = 15000;

/**
 * Wraps a socket in the small request/response dance SMTP needs: send a line,
 * wait for the reply, check its status code.
 *
 * A reply may span several lines. Continuation lines read "250-text", the
 * final one reads "250 text" — the space instead of the hyphen is the signal
 * that the reply is complete.
 */
function smtpSessie(socket) {
  let buffer = '';
  let wachtend = null;

  const opData = chunk => {
    buffer += chunk;
    const laatste = buffer.split(/\r?\n/).filter(Boolean).at(-1) || '';
    const klaar = /^(\d{3}) /.exec(laatste);
    if (!klaar || !wachtend) return;
    const antwoord = buffer;
    const code = Number(klaar[1]);
    buffer = '';
    const { resolve, reject, verwacht } = wachtend;
    wachtend = null;
    if (verwacht && !verwacht.includes(code)) {
      reject(new Error(`SMTP replied ${code}: ${laatste}`));
    } else {
      resolve({ code, tekst: antwoord });
    }
  };

  const opFout = e => {
    if (wachtend) { const { reject } = wachtend; wachtend = null; reject(e); }
  };

  socket.setEncoding('utf8');
  socket.on('data', opData);
  socket.on('error', opFout);

  const lees = verwacht => new Promise((resolve, reject) => {
    wachtend = { resolve, reject, verwacht };
  });

  return {
    lees,
    async stuur(regel, verwacht) {
      socket.write(regel + '\r\n');
      return lees(verwacht);
    },
    // Before wrapping the socket in TLS these listeners have to go, otherwise
    // they would swallow the bytes the TLS layer needs to read.
    losmaken() {
      socket.removeListener('data', opData);
      socket.removeListener('error', opFout);
      socket.setEncoding(null);
    }
  };
}

function verbind({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host }, () => resolve(socket))
      : net.connect({ host, port }, () => resolve(socket));
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('SMTP timeout')));
    socket.once('error', reject);
  });
}

function upgradeNaarTls(socket, host) {
  return new Promise((resolve, reject) => {
    const veilig = tls.connect({ socket, servername: host }, () => resolve(veilig));
    veilig.once('error', reject);
  });
}

const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');

// Header values must stay on one line: a newline in a subject would let the
// rest of it be read as extra headers.
const kopregel = s => String(s).replace(/[\r\n]+/g, ' ').trim();

/** Sends one message. Throws on any SMTP error, so callers can log it. */
export async function stuurMail({ naar, onderwerp, tekst }) {
  const { settings } = load();
  const smtp = settings.smtp || {};
  if (!smtp.enabled || !smtp.host || !smtp.from) return false;
  const ontvangers = [...new Set((naar || []).filter(Boolean))];
  if (!ontvangers.length) return false;

  const wachtwoord = smtp.passEncrypted ? decryptSecret(smtp.passEncrypted) : '';
  const port = Number(smtp.port) || 587;
  // Implicit TLS when the settings say so, and by default on the port that
  // conventionally means it. Anything else starts plain and upgrades.
  const secure = smtp.secure != null ? Boolean(smtp.secure) : port === 465;

  let socket = await verbind({ host: smtp.host, port, secure });
  let sessie = smtpSessie(socket);
  await sessie.lees([220]);
  await sessie.stuur(`EHLO ${smtp.host}`, [250]);

  if (!secure) {
    await sessie.stuur('STARTTLS', [220]);
    sessie.losmaken();
    socket = await upgradeNaarTls(socket, smtp.host);
    sessie = smtpSessie(socket);
    await sessie.stuur(`EHLO ${smtp.host}`, [250]);
  }

  if (smtp.user) {
    await sessie.stuur('AUTH LOGIN', [334]);
    await sessie.stuur(b64(smtp.user), [334]);
    await sessie.stuur(b64(wachtwoord), [235]);
  }

  await sessie.stuur(`MAIL FROM:<${smtp.from}>`, [250]);
  for (const rcpt of ontvangers) await sessie.stuur(`RCPT TO:<${rcpt}>`, [250, 251]);
  await sessie.stuur('DATA', [354]);

  const body = [
    `From: Rossing T&M CMS <${smtp.from}>`,
    `To: ${ontvangers.join(', ')}`,
    `Subject: ${kopregel(onderwerp)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    // A line consisting of a single dot ends the message, so any such line in
    // the body has to be escaped with a second dot.
    String(tekst).split('\n').map(r => (r === '.' ? '..' : r)).join('\r\n'),
    '.'
  ].join('\r\n');
  await sessie.stuur(body, [250]);
  await sessie.stuur('QUIT', [221]).catch(() => {});
  socket.end();
  return true;
}

/** Everyone who should hear about management-level events. */
export function beheerdersAdressen() {
  const db = load();
  return db.users.filter(u => u.rol === 'admin' || u.rol === 'manager').map(u => u.email);
}

/** The email address of one user, if they have one. */
export function adresVan(userId) {
  const db = load();
  return db.users.find(u => u.id === userId)?.email || null;
}
