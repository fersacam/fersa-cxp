import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PDFOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  foot?: (string | number)[][];
  filename: string;
  orientation?: 'portrait' | 'landscape';
}

export const generatePDF = (options: PDFOptions) => {
  const { title, subtitle, headers, rows, foot, filename, orientation = 'landscape' } = options;
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'letter' });

  // Header
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text(title, 14, 20);

  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 14, 28);
  }

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const dateStr = `Generado: ${new Date().toLocaleString('es-NI')}`;
  doc.text(dateStr, doc.internal.pageSize.getWidth() - 14, 20, { align: 'right' });

  // Table
  autoTable(doc, {
    startY: subtitle ? 34 : 28,
    head: [headers],
    body: rows,
    foot: foot ? foot : undefined,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [241, 245, 249],
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `FERSA CXP - Página ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  doc.save(`${filename}.pdf`);
};
