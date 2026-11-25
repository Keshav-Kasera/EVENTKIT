import { useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Printer, QrCode, ShieldCheck, X } from "lucide-react";
import { apiFetch, uploadFile } from "../lib/api";

interface ChecklistItem {
  itemName: string;
  expectedQty: number;
  observedQty: number;
  condition: "GOOD" | "MINOR_WEAR" | "DAMAGED" | "MISSING";
  notes?: string;
}

export interface ChecklistData {
  id: string;
  checklistType: "DELIVERY" | "RETURN";
  qrToken: string;
  qrImageUrl?: string;
  itemConditionCounts: ChecklistItem[];
  preExistingDefects?: string | null;
  damageClaimAmount: number;
  photoUrls?: string[] | null;
  organizerSigned: boolean;
  vendorSigned: boolean;
  organizerPin?: string | null;
  vendorPin?: string | null;
  signedAt?: string | null;
}

export function QrManifestModal({
  bookingId,
  bookingCode,
  checklist,
  userRole,
  onClose,
  onCompleted,
}: {
  bookingId: string;
  bookingCode: string;
  checklist: ChecklistData;
  userRole: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [scannedToken, setScannedToken] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>(
    Array.isArray(checklist.itemConditionCounts) ? checklist.itemConditionCounts : []
  );
  const [defects, setDefects] = useState(checklist.preExistingDefects || "");
  const [damageClaim, setDamageClaim] = useState(String(checklist.damageClaimAmount || 0));
  const [pinCode, setPinCode] = useState(
    userRole === "VENDOR" ? checklist.vendorPin || "9034" : checklist.organizerPin || "4821"
  );
  const [photoUrls, setPhotoUrls] = useState<string[]>(
    Array.isArray(checklist.photoUrls) ? checklist.photoUrls : []
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const res = await uploadFile(file);
      setPhotoUrls((prev) => [...prev, res.url]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/bookings/${bookingId}/handover/${checklist.checklistType}`, {
        method: "POST",
        body: JSON.stringify({
          qrToken: scannedToken.trim(),
          itemConditionCounts: items,
          preExistingDefects: defects,
          damageClaimAmount: Number(damageClaim) || 0,
          photoUrls,
          pinCode,
        }),
      });
      onCompleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const hasDiscrepancy =
    Number(damageClaim) > 0 ||
    items.some((i) => i.observedQty < i.expectedQty || i.condition === "DAMAGED" || i.condition === "MISSING");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm">
      <div className="ek-card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-saffron">
              {checklist.checklistType} HANDOVER MANIFEST • {bookingCode}
            </p>
            <h3 className="font-display text-xl font-bold text-ink">
              QR-Verified Custody & Condition Audit
            </h3>
          </div>
          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="ek-btn-secondary px-3 py-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" /> Print Pass
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-rule p-1.5 text-muted hover:bg-sand"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* QR Pass Section */}
        <div className="mt-4 grid gap-4 rounded-xl border border-rule bg-canvas/70 p-4 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center justify-center rounded-lg border border-rule bg-white p-2">
            {checklist.qrImageUrl ? (
              <img src={checklist.qrImageUrl} alt="Handover QR Code" className="h-32 w-32" />
            ) : (
              <QrCode className="h-24 w-24 text-ink" />
            )}
            <span className="mt-1 font-mono text-[10px] font-semibold text-muted">
              HMAC-SHA256 PASS
            </span>
          </div>

          <div className="flex flex-col justify-between gap-2 text-xs">
            <div>
              <p className="font-semibold text-ink">Official Manifest QR Token:</p>
              <p className="mt-1 break-all rounded-md border border-rule bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-teal-dark">
                {checklist.qrToken}
              </p>
              <p className="mt-2 text-muted">
                Both parties verify on-site counts against this QR token to guarantee non-repudiation.
                Your Verification PIN:{" "}
                <span className="font-mono font-bold text-ink">
                  {userRole === "VENDOR" ? checklist.vendorPin : checklist.organizerPin}
                </span>
              </p>
            </div>
            <div className="no-print">
              <button
                type="button"
                onClick={() => setScannedToken(checklist.qrToken)}
                className="inline-flex items-center gap-1.5 rounded-md bg-teal-soft px-3 py-1.5 text-xs font-semibold text-teal-dark border border-teal/30 hover:bg-teal hover:text-white transition"
              >
                <QrCode className="h-3.5 w-3.5" /> Simulate Camera QR Scan (Auto-Fill Token)
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 no-print">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Scanned / Verified QR Token *
            </label>
            <input
              type="text"
              required
              value={scannedToken}
              onChange={(e) => setScannedToken(e.target.value)}
              placeholder="Scan or paste EK-BK-... token above"
              className="ek-input font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
              Line-Item Condition & Quantity Inspection
            </label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.itemName}
                  className="grid gap-2 rounded-lg border border-rule bg-surface p-3 sm:grid-cols-[1.5fr_0.7fr_1fr]"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.itemName}</p>
                    <p className="font-mono text-xs text-muted">Expected: {item.expectedQty} units</p>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted">Observed Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={item.observedQty}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, observedQty: val } : p))
                        );
                      }}
                      className="ek-input py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted">Condition</label>
                    <select
                      value={item.condition}
                      onChange={(e) => {
                        const cond = e.target.value as ChecklistItem["condition"];
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, condition: cond } : p))
                        );
                      }}
                      className="ek-input py-1.5 text-xs"
                    >
                      <option value="GOOD">Good / Intact</option>
                      <option value="MINOR_WEAR">Normal Wear</option>
                      <option value="DAMAGED">Damaged</option>
                      <option value="MISSING">Missing Units</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Defect / Inspection Notes
              </label>
              <input
                type="text"
                value={defects}
                onChange={(e) => setDefects(e.target.value)}
                placeholder="e.g., Minor tear on canopy corner or All intact"
                className="ek-input text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                {checklist.checklistType === "RETURN" ? "Damage Claim Amount (₹)" : "4-Digit Sign PIN"}
              </label>
              {checklist.checklistType === "RETURN" ? (
                <input
                  type="number"
                  min={0}
                  value={damageClaim}
                  onChange={(e) => setDamageClaim(e.target.value)}
                  className="ek-input font-mono text-xs"
                />
              ) : (
                <input
                  type="text"
                  required
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="ek-input font-mono text-xs"
                />
              )}
            </div>
          </div>

          {/* Photo Evidence Upload */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              On-Site Photo Evidence (Optional)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="ek-btn-secondary cursor-pointer py-2 text-xs">
                <Camera className="h-3.5 w-3.5" />
                {uploading ? "Uploading..." : "Attach Condition Photo"}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              {photoUrls.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt="Evidence"
                  className="h-12 w-12 rounded-lg border border-rule object-cover"
                />
              ))}
            </div>
          </div>

          {checklist.checklistType === "RETURN" && hasDiscrepancy && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="font-semibold">Discrepancy Detected — Auto-Escalation Trigger</p>
                <p>
                  Submitting this Return Audit with missing units, damage flags, or a claim &gt; ₹0
                  will freeze escrow, mark the booking <strong>DISPUTED</strong>, and auto-create an
                  immutable Admin mediation ticket (TC-08).
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="ek-btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={hasDiscrepancy && checklist.checklistType === "RETURN" ? "ek-btn-primary bg-red-700 hover:bg-red-800" : "ek-btn-teal"}
            >
              {checklist.checklistType === "RETURN" && hasDiscrepancy ? (
                <>
                  <AlertTriangle className="h-4 w-4" />
                  {submitting ? "Escalating..." : "Log Audit & Escalate Dispute"}
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  {submitting ? "Signing..." : `Verify QR & Sign ${checklist.checklistType}`}
                </>
              )}
            </button>
          </div>
        </form>

        {checklist.signedAt && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-teal/30 bg-teal-soft px-3 py-2 text-xs text-teal-dark">
            <CheckCircle2 className="h-4 w-4" />
            Last signed at {new Date(checklist.signedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
