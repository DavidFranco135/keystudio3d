const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractDetailMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item)))
        .join("; ");
    }
    // Corpo estruturado do LimitExceededError (402) — {message, limit_key,
    // current_usage, limit} — ver src/interfaces/http/errors.py.
    if (detail && typeof detail === "object" && "message" in detail) {
      return String((detail as { message: unknown }).message);
    }
  }
  return fallback;
}

const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Não encontrado" da API vem só com o código do item (um UUID), o que não
// diz nada para quem está usando: troca por uma frase que explica.
function friendlyMessage(status: number, message: string): string {
  if (status === 404 && UUID_ONLY.test(message.trim())) {
    return "Esse item não existe mais (foi apagado). Atualize a página e tente de novo.";
  }
  return message;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { accessToken?: string | null } = {}
): Promise<T> {
  const { accessToken, headers, body, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    body,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(response.status, friendlyMessage(response.status, extractDetailMessage(errorBody, response.statusText)));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// Fotos grandes (ex.: 15 MB do celular) ou em formatos que o servidor não
// aceita são convertidas no próprio navegador antes de enviar: no máximo
// 2560 px no lado maior, em JPEG (ou WebP, se tiver transparência), bem
// abaixo do limite de 10 MB. Fotos já leves e em JPG/PNG/WebP vão como estão.
const UPLOAD_OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const UPLOAD_SOFT_LIMIT = 2.5 * 1024 * 1024;
const UPLOAD_MAX_SIDE = 2560;

async function prepareImageForUpload(file: File): Promise<File> {
  const okType = UPLOAD_OK_TYPES.includes(file.type);
  if (okType && file.size <= UPLOAD_SOFT_LIMIT) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (okType && file.size <= 10 * 1024 * 1024) return file;
    throw new ApiError(
      415,
      "Não foi possível ler esta foto. Envie em JPG ou PNG (no iPhone: Ajustes → Câmera → Formatos → Mais Compatível)."
    );
  }
  const keepAlpha = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
  let side = UPLOAD_MAX_SIDE;
  let quality = 0.86;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    const type = keepAlpha ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (blob && blob.size <= 9 * 1024 * 1024) {
      bitmap.close?.();
      const base = file.name.replace(/\.[^.]+$/, "") || "foto";
      return new File([blob], `${base}.${type === "image/webp" ? "webp" : "jpg"}`, { type });
    }
    side = Math.round(side * 0.8);
    quality = Math.max(0.6, quality - 0.08);
  }
  bitmap.close?.();
  throw new ApiError(413, "A foto é grande demais mesmo depois de reduzida. Tente outra foto.");
}

export async function uploadImage(
  path: string,
  accessToken: string | null | undefined,
  original: File
): Promise<{ url: string }> {
  const file = await prepareImageForUpload(original);
  const formData = new FormData();
  formData.append("file", file);

  // No Content-Type header here on purpose — the browser sets
  // multipart/form-data with the right boundary itself; forcing one
  // manually breaks the server's multipart parsing.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(response.status, extractDetailMessage(errorBody, response.statusText));
  }
  return (await response.json()) as { url: string };
}
