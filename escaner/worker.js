// Intermediario del escáner de fichas · CPOD Paccha
// Se pega tal cual en un Cloudflare Worker. NO contiene claves.
// Necesita, en Settings → Variables and Secrets del Worker:
//   ANTHROPIC_API_KEY  (Secret)  → tu clave de la API de Anthropic
//   ALLOWED_EMAIL      (Text)    → el correo con el que entras a la app
// Solo atiende a quien tenga una sesión válida de la app con ese correo.

const PROJECT = "odontograma-paccha";
const ORIGINS = ["https://breyner08.github.io"];
const MODEL = "claude-sonnet-5-5";
const JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const MAX_BYTES = 9 * 1024 * 1024;

const PROMPT = `Eres un asistente que transcribe fichas epidemiológicas de salud oral en papel (Universidad Peruana Cayetano Heredia, Departamento de Odontología Social) llenadas a mano por un interno de odontología. Transcribe EXACTAMENTE lo escrito; no inventes ni deduzcas datos clínicos que no estén marcados. Si algo es ilegible o dudoso, deja el campo vacío o con tu mejor lectura y agrégalo a "dudas".

Estructura de la ficha (página 1):
I. DATOS PERSONALES: Apellidos y Nombres; Género (M/F encerrado en un círculo); Dirección; Colegio; Grado; Sección. A la derecha, tabla día/mes/año con Fecha de examen (A) y Fecha de nacimiento (B); debajo Edad (A-B), DNI y SIS.
II. EXAMEN ESTOMATOLÓGICO (solo lo anormal): ATM, Ganglios, Queilitis, Lengua, Aftas, Otros; cada uno con NO / SI encerrado y una línea para describir.
III. IHO-S: seis columnas (16/17, 11/21, 26/27, 36/37, 31/41, 46/47) con fila IPB (placa blanda) y fila IPC (placa calcificada); valores 0, 1, 2, 3 o NR (no registrable). Puede haber una pieza sustituta anotada entre paréntesis.
IV. REGISTRO DE CARIES: dos arcadas, 16 columnas cada una. Cada columna tiene el número de la pieza permanente arriba a la izquierda y, en las columnas centrales, el de la decidua abajo a la derecha; la pieza examinada se encierra en un círculo. Debajo: fila "Pieza" (código de la pieza completa) y filas por superficie. Superior: O, P, D, V, M. Inferior: O, L, D, V, M. P (palatino) y L (lingual) son la misma cara "L". Los incisivos y caninos no tienen fila O.
Códigos de superficie: 0 sana, 1 caries, 2 obturada con caries, 3 obturada sin caries, 6 sellante.
Códigos de pieza: 4 perdida por caries, 5 perdida por otra razón, 7 pilar de puente, 8 permanente no erupcionada, 9 no registrable, 10 traumatismo, 11 hipoplasia.
Al pie: Observaciones.

Reglas para "piezas":
- Devuelve un elemento por cada columna que tenga algo escrito o un círculo. Usa el número FDI de la pieza CIRCULADA; si no hay círculo, usa la permanente.
- "pieza" es el código de la fila Pieza tal como está ("" si vacío). Si en la fila Pieza hay un código de superficie (0–3, 6) es solo el resumen: ponlo igual.
- "caras": el código escrito en cada fila de superficie de esa columna ("" si vacía). Usa la clave L para P o L.
- Si una columna está tachada o tiene X sin código, pon pieza "X".
- Marca "duda": true en la pieza si algún número es poco legible.
Fechas en formato DD/MM/AAAA. Sexo "Femenino" o "Masculino". Si la ficha no corresponde a este formato, devuelve campos vacíos y explícalo en "nota".`;

const SCHEMA = {
  type: "object",
  properties: {
    nombre: { type: "string" },
    sexo: { type: "string", enum: ["", "Femenino", "Masculino"] },
    direccion: { type: "string" },
    colegio: { type: "string" },
    grado: { type: "string", description: "Número de grado, p. ej. 3" },
    seccion: { type: "string", description: "Letra de sección, p. ej. B" },
    fecha_examen: { type: "string" },
    fecha_nacimiento: { type: "string" },
    edad: { type: "string" },
    dni: { type: "string" },
    sis: { type: "string" },
    estomatologico: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string", enum: ["ATM", "Ganglios", "Queilitis", "Lengua", "Aftas", "Otros"] },
          valor: { type: "string", enum: ["", "NO", "SI"] },
          detalle: { type: "string" }
        },
        required: ["item", "valor", "detalle"]
      }
    },
    ipb: { type: "array", items: { type: "string" }, description: "6 valores en orden 16/17, 11/21, 26/27, 36/37, 31/41, 46/47: '0'-'3', 'NR' o ''" },
    ipc: { type: "array", items: { type: "string" }, description: "Igual que ipb, para placa calcificada" },
    piezas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          pieza: { type: "string" },
          caras: {
            type: "object",
            properties: { O: { type: "string" }, L: { type: "string" }, D: { type: "string" }, V: { type: "string" }, M: { type: "string" } },
            required: ["O", "L", "D", "V", "M"]
          },
          duda: { type: "boolean" }
        },
        required: ["n", "pieza", "caras", "duda"]
      }
    },
    observaciones: { type: "string" },
    dudas: { type: "array", items: { type: "string" }, description: "Nombres de los campos dudosos: nombre, sexo, direccion, colegio, grado, seccion, fecha_examen, fecha_nacimiento, edad, dni, sis, estomatologico, ipb, ipc, observaciones" },
    nota: { type: "string" }
  },
  required: ["nombre", "sexo", "direccion", "colegio", "grado", "seccion", "fecha_examen", "fecha_nacimiento", "edad", "dni", "sis", "estomatologico", "ipb", "ipc", "piezas", "observaciones", "dudas", "nota"]
};

function cors(origin) {
  const ok = ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

const b64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function verifyToken(token, env) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new Error("token");
  const header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("alg");
  const res = await fetch(JWKS, { cf: { cacheTtl: 3600, cacheEverything: true } });
  const { keys } = await res.json();
  const jwk = (keys || []).find(k => k.kid === header.kid);
  if (!jwk) throw new Error("kid");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("firma");
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT || payload.iss !== "https://securetoken.google.com/" + PROJECT) throw new Error("proyecto");
  if (!(payload.exp > now) || payload.iat > now + 300) throw new Error("vencido");
  const allowed = String(env.ALLOWED_EMAIL || "").trim().toLowerCase();
  if (!allowed || String(payload.email || "").toLowerCase() !== allowed) throw new Error("correo");
  return payload;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method === "GET") return json({ ok: true, servicio: "escaner CPOD Paccha", configurado: !!env.ANTHROPIC_API_KEY && !!env.ALLOWED_EMAIL }, 200, origin);
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405, origin);
    if (!ORIGINS.includes(origin)) return json({ error: "Origen no permitido" }, 403, origin);
    if (!env.ANTHROPIC_API_KEY || !env.ALLOWED_EMAIL) return json({ error: "Falta configurar ANTHROPIC_API_KEY o ALLOWED_EMAIL en el Worker" }, 500, origin);

    try { await verifyToken((request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), env); }
    catch (e) { return json({ error: "Sesión no válida", motivo: e.message }, 401, origin); }

    const len = +(request.headers.get("Content-Length") || 0);
    if (len > MAX_BYTES) return json({ error: "Imagen demasiado grande" }, 413, origin);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "Solicitud inválida" }, 400, origin); }
    const imgs = Array.isArray(body.images) ? body.images.slice(0, 2) : [];
    if (!imgs.length || imgs.some(i => !/^image\/(jpeg|png|webp)$/.test(i.media_type) || typeof i.data !== "string")) return json({ error: "Falta la foto" }, 400, origin);

    const content = imgs.map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } }));
    content.push({ type: "text", text: "Transcribe esta ficha con la herramienta registrar_ficha." });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.MODEL || MODEL,
        max_tokens: 4096,
        system: PROMPT,
        tools: [{ name: "registrar_ficha", description: "Registra los datos transcritos de la ficha", input_schema: SCHEMA }],
        tool_choice: { type: "tool", name: "registrar_ficha" },
        messages: [{ role: "user", content }]
      })
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (out.error && out.error.message) || ("Error " + r.status);
      const hint = r.status === 401 ? "La clave de Anthropic no es válida." : r.status === 400 && /credit/i.test(msg) ? "No hay saldo en la cuenta de Anthropic." : r.status === 429 ? "Demasiadas solicitudes; espera un momento." : r.status === 529 ? "El servicio está saturado; intenta de nuevo." : msg;
      return json({ error: hint }, 502, origin);
    }
    const tu = (out.content || []).find(c => c.type === "tool_use");
    if (!tu) return json({ error: "No se pudo leer la ficha" }, 502, origin);
    return json({ ok: true, data: tu.input, uso: out.usage || null }, 200, origin);
  }
};
