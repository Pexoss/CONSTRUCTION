import PDFDocument from "pdfkit";

export type PdfTableSection = {
  title?: string;
  headers: string[];
  rows: string[][];
};

/**
 * Relatório tabular simples em PDF (paisagem, várias seções).
 */
export function buildPdfReport(options: {
  title: string;
  subtitle?: string;
  sections: PdfTableSection[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 36,
      size: "A4",
      layout: "landscape",
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageInnerW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const x0 = doc.page.margins.left;

    doc.fontSize(14).font("Helvetica-Bold").text(options.title, { align: "center" });
    doc.moveDown(0.4);
    if (options.subtitle) {
      doc.fontSize(9).font("Helvetica").fillColor("#333333").text(options.subtitle, {
        align: "center",
      });
      doc.fillColor("#000000");
    }
    doc.moveDown(0.8);

    const drawSection = (sec: PdfTableSection) => {
      if (sec.title) {
        doc.fontSize(11).font("Helvetica-Bold").text(sec.title);
        doc.moveDown(0.35);
      }
      const cols = sec.headers.length || 1;
      const colW = pageInnerW / cols;
      const pad = 4;
      const lineH = 11;
      let y = doc.y;

      const ensureSpace = (need: number) => {
        if (y + need > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
      };

      doc.fontSize(8).font("Helvetica-Bold");
      ensureSpace(lineH + 4);
      sec.headers.forEach((h, i) => {
        doc.text(h, x0 + i * colW + pad, y, {
          width: colW - pad * 2,
          lineBreak: false,
        });
      });
      y += lineH + 2;
      doc.font("Helvetica");

      for (const row of sec.rows) {
        ensureSpace(lineH + 2);
        row.forEach((cell, i) => {
          doc.text(cell ?? "", x0 + i * colW + pad, y, {
            width: colW - pad * 2,
            lineBreak: false,
          });
        });
        y += lineH;
      }
      doc.y = y + 8;
    };

    for (const sec of options.sections) {
      drawSection(sec);
    }

    doc.end();
  });
}
