import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function downloadDashboardReportPdf({
  title,
  range,
  generatedAt,
  startDate,
  summaryRows,
  tableColumns,
  tableRows,
  fileName,
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const safeSummaryRows = Array.isArray(summaryRows) ? summaryRows : [];
  const safeColumns = Array.isArray(tableColumns) ? tableColumns : [];
  const fallbackWidth = Math.max(1, safeColumns.length || 6);
  const safeRows = Array.isArray(tableRows) && tableRows.length
    ? tableRows
    : [Array.from({ length: fallbackWidth }, () => "-")];

  const rangeLabel = String(range || "week").toLowerCase();
  const mappedRange = rangeLabel === "day"
    ? "Per Day"
    : rangeLabel === "month"
      ? "Per Month"
      : "Per Week";

  doc.setFillColor(0, 33, 71);
  doc.rect(0, 0, pageWidth, 66, "F");
  doc.setFillColor(253, 200, 0);
  doc.rect(0, 62, pageWidth, 4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title || "Dashboard Report", 36, 39);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Sona College of Technology", pageWidth - 200, 39);

  doc.setTextColor(17, 43, 73);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Range: ${mappedRange}`, 36, 88);
  if (startDate) {
    doc.text(`From: ${formatDate(startDate)}`, 170, 88);
  }
  doc.text(`Generated: ${formatDate(generatedAt)}`, pageWidth - 260, 88);

  let y = 108;
  const cardW = 152;
  const cardH = 52;
  const gap = 10;
  const columns = 5;

  for (let i = 0; i < safeSummaryRows.length; i += 1) {
    const row = safeSummaryRows[i];
    const x = 36 + ((cardW + gap) * (i % columns));
    const rowY = y + Math.floor(i / columns) * (cardH + 8);
    doc.setDrawColor(207, 218, 234);
    doc.setFillColor(245, 249, 255);
    doc.roundedRect(x, rowY, cardW, cardH, 8, 8, "FD");
    doc.setTextColor(95, 111, 132);
    doc.setFontSize(9);
    doc.text(String(row.label || ""), x + 10, rowY + 18);
    doc.setTextColor(17, 43, 73);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(String(row.value ?? "-"), x + 10, rowY + 38);
    doc.setFont("helvetica", "normal");
  }

  y += Math.ceil(safeSummaryRows.length / columns) * (cardH + 8) + 16;

  autoTable(doc, {
    startY: y,
    head: [safeColumns],
    body: safeRows,
    theme: "grid",
    headStyles: {
      fillColor: [53, 94, 154],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [31, 40, 51],
    },
    alternateRowStyles: {
      fillColor: [247, 251, 255],
    },
    margin: { left: 36, right: 36 },
    styles: {
      cellPadding: 6,
      overflow: "linebreak",
    },
    didDrawPage: (data) => {
      const current = data.pageNumber;
      doc.setFontSize(9);
      doc.setTextColor(95, 111, 132);
      doc.text(
        `Page ${current}`,
        pageWidth - 70,
        pageHeight - 14
      );
    },
  });

  doc.save(fileName || "dashboard-report.pdf");
}
