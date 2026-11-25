import crypto from "crypto";
import QRCode from "qrcode";

function getQrSecret(): string {
  return process.env.QR_HMAC_SECRET || "eventkit-dev-qr-secret";
}

export function generateManifestQrToken(
  bookingCode: string,
  checklistType: "DELIVERY" | "RETURN"
): string {
  const hash = crypto
    .createHmac("sha256", getQrSecret())
    .update(`${bookingCode}:${checklistType}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `EK-${bookingCode}-${checklistType.slice(0, 3)}-${hash}`;
}

export function generatePin4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function renderQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 240,
    margin: 2,
    color: {
      dark: "#16181D",
      light: "#FFFFFF",
    },
  });
}
