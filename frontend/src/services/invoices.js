const api = import.meta.env.VITE_API_BASE_URL || "";

export async function fetchInvoicePdf(invoiceId, token, invoiceNumber) {
  const response = await fetch(`${api}/api/sales/invoices/${invoiceId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Invoice PDF request failed (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  if (blob.type && blob.type !== "application/pdf") throw new Error("The server returned a file that is not a PDF.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ShopMind-${invoiceNumber || invoiceId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
