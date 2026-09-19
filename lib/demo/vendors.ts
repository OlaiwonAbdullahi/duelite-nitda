import type { DueType } from "../rep/models";
import { spacePermission, validDue } from "./spaces";
import type { DemoState } from "./store";

export type Product = { id: string; name: string; type: DueType; listKobo: number; priceKobo: number };
/** Vendor settlement account has the same display shape as a rep's saved destination. */
export type Vendor = { id: string; name: string; bank: string; accountNumber: string; accountName: string; products: Product[] };
/** Two approved, synthetic demo vendors. A catalogue constant, not persisted state. */
export const VENDORS: Vendor[] = [
  { id: "vendor-yaba-print", name: "Yaba Print Hub", bank: "Zenith Bank", accountNumber: "1012345678", accountName: "Yaba Print Hub Ltd", products: [
    { id: "yph-handout", name: "Spiral-bound course handout", type: "handout", listKobo: 150_000, priceKobo: 120_000 },
    { id: "yph-lab-manual", name: "Printed lab manual", type: "lab_manual", listKobo: 250_000, priceKobo: 200_000 },
  ] },
  { id: "vendor-campus-threads", name: "Campus Threads", bank: "Access Bank", accountNumber: "0098765432", accountName: "Campus Threads Enterprises", products: [
    { id: "ct-tee", name: "Departmental T-shirt", type: "departmental_wear", listKobo: 600_000, priceKobo: 450_000 },
    { id: "ct-polo", name: "Departmental polo", type: "departmental_wear", listKobo: 850_000, priceKobo: 700_000 },
  ] },
];
export const MAX_QUANTITY = 1000;
export type VendorOrder = { id: string; spaceId: string; vendorId: string; productId: string; quantity: number; unitKobo: number; totalKobo: number; dueId: string; createdBy: string; createdAt: string };
export type VendorState = { orders: VendorOrder[] };
export type VendorCommand = { type: "attach_vendor_item"; spaceId: string; productId: string; quantity: number; deadline: string };

export function findProduct(productId: string) {
  for (const vendor of VENDORS) {
    const product = vendor.products.find(item => item.id === productId);
    if (product) return { vendor, product };
  }
  return null;
}

/** Settlement state comes from the withdrawal ledger: an order is paid once, through the normal withdrawal protections. */
export function orderSettlement(state: DemoState, orderId: string) {
  const attempts = state.withdrawals.filter(item => item.orderId === orderId);
  const status = attempts.some(item => item.status === "succeeded") ? "settled"
    : attempts.some(item => ["pending_review", "awaiting_signatories", "processing"].includes(item.status)) ? "in_progress" : "unpaid";
  return { status, attempts } as const;
}

/** Attach a discounted catalogue item as a draft due priced per student; the vendor total is unit price × quantity. */
export function transitionVendor(state: DemoState, action: VendorCommand, now: number, id: string): DemoState {
  if (state.audit.some(entry => entry.id === id)) throw new Error("This operation has already been used.");
  if (!spacePermission(state, action.spaceId, "manage_dues")) throw new Error("Your role cannot add dues in this space.");
  const found = findProduct(action.productId);
  if (!found) throw new Error("Choose a product from an approved vendor.");
  if (!Number.isSafeInteger(action.quantity) || action.quantity < 1 || action.quantity > MAX_QUANTITY) throw new Error(`Order between 1 and ${MAX_QUANTITY} units.`);
  const due = { id: `${id}-due`, spaceId: action.spaceId, title: `${found.product.name} · ${found.vendor.name}`, type: found.product.type, amountKobo: found.product.priceKobo, deadline: action.deadline, allowInstalments: false, status: "draft" as const };
  if (!validDue(due)) throw new Error("Choose a valid deadline.");
  const at = new Date(now).toISOString();
  const order: VendorOrder = { id, spaceId: action.spaceId, vendorId: found.vendor.id, productId: found.product.id, quantity: action.quantity, unitKobo: found.product.priceKobo, totalKobo: found.product.priceKobo * action.quantity, dueId: due.id, createdBy: state.selectedId, createdAt: at };
  return { ...state, dues: [...state.dues, due], orders: [...state.orders, order], audit: [...state.audit, { id, actorId: state.selectedId, action: action.type, targetId: id, at }] };
}

/** Strict restore validation for version-6 vendor orders. */
export function validOrders(state: DemoState) {
  const keys = ["createdAt", "createdBy", "dueId", "id", "productId", "quantity", "spaceId", "totalKobo", "unitKobo", "vendorId"].join();
  if (!Array.isArray(state.orders)) return false;
  const ids = new Set<string>();
  return state.orders.every(item => {
    const found = findProduct(item?.productId);
    const ok = item && typeof item === "object" && Object.keys(item).sort().join() === keys && typeof item.id === "string" && !ids.has(item.id)
      && !!found && found.vendor.id === item.vendorId && item.unitKobo === found.product.priceKobo
      && Number.isSafeInteger(item.quantity) && item.quantity >= 1 && item.quantity <= MAX_QUANTITY && item.totalKobo === item.unitKobo * item.quantity
      && state.spaces.some(space => space.id === item.spaceId) && state.users.some(user => user.id === item.createdBy)
      && state.dues.some(due => due.id === item.dueId && due.spaceId === item.spaceId && due.amountKobo === item.unitKobo)
      && !state.orders.some(other => other !== item && other.dueId === item.dueId) && Number.isFinite(Date.parse(item.createdAt));
    ids.add(item.id);
    return ok;
  });
}
