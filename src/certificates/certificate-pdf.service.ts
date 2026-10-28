import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as path from 'path';

/**
 * Server-side certificate PDF generation (Phase 5, spec 51-53).
 *
 * - REAL PDF (pdfkit) — never a screenshot; generated deterministically on
 *   request from PERSISTED certificate data (the DB stays authoritative).
 * - Deterministic bytes: CreationDate/ModDate are pinned to issuedAt and
 *   content derives only from persisted fields → the same certificate
 *   always produces the identical document.
 * - Vietnamese-safe: DejaVu Sans (bundled via dejavu-fonts-ttf) renders
 *   full Vietnamese diacritics; pdfkit's built-in Helvetica cannot.
 * - ASCII-only lines (certificate number, verification code, verify URL)
 *   are drawn with the built-in Helvetica so they stay searchable in the
 *   uncompressed stream (auditability + e2e-verifiable).
 * - compress:false keeps streams uncompressed: certificate PDFs are small,
 *   and raw inspection must be able to confirm the certificate number.
 * - The verification URL comes from configuration — no hardcoded host.
 */
export const CERTIFICATE_FONTS = {
  regular: path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf', 'DejaVuSans.ttf'),
  bold: path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf', 'DejaVuSans-Bold.ttf'),
};

export interface CertificatePdfData {
  certificateNumber: string;
  verificationCode: string;
  holderName: string;
  roleLabel: string | null;
  projectName: string | null;
  sessionName: string | null;
  policyCode: string;
  policyVersion: number;
  issuedAt: Date;
  completedAt?: Date | null;
  verifyBaseUrl: string;
}

@Injectable()
export class CertificatePdfService {
  /** Render the certificate PDF. Returns the full buffer (200, application/pdf). */
  async render(data: CertificatePdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 56,
      compress: false,
      info: {
        // pdfkit 0.15 subsets every font (glyph-ID streams), so the Info
        // dictionary is the machine-readable representation of the identity
        // fields — Title carries the certificate number, Keywords the
        // verification code (both e2e-verifiable raw).
        Title: `V-Intern Certificate ${data.certificateNumber}`,
        Author: 'V-Intern',
        Subject: `V-Intern completion certificate (${data.policyCode} v${data.policyVersion})`,
        Keywords: `certificate verification ${data.verificationCode}`,
        CreationDate: data.issuedAt,
        ModDate: data.issuedAt,
      },
    });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // ── Decorative frame ────────────────────────────────────────────────
    const page = doc.page;
    doc.save();
    doc.rect(page.margins.left, page.margins.top, page.width - page.margins.left - page.margins.right, page.height - page.margins.top - page.margins.bottom);
    doc.lineWidth(2).strokeColor('#5b4a2f').stroke();
    doc.rect(page.margins.left + 8, page.margins.top + 8, page.width - 2 * page.margins.left - 16, page.height - 2 * page.margins.top - 16);
    doc.lineWidth(0.75).strokeColor('#b59b6a').stroke();
    doc.restore();

    const left = page.margins.left + 48;
    let y = page.margins.top + 56;

    doc.font(CERTIFICATE_FONTS.bold).fontSize(26).fillColor('#3d3223');
    doc.text('V-INTERN', left, y, { align: 'left' });
    y += 34;
    doc.font(CERTIFICATE_FONTS.regular).fontSize(11).fillColor('#7a6a4f');
    doc.text('Chương trình thực tập ảo — Virtual Internship Program', left, y);
    y += 40;

    doc.font(CERTIFICATE_FONTS.bold).fontSize(30).fillColor('#3d3223');
    doc.text('GIẤY CHỨNG NHẬN HOÀN THÀNH', left, y, { align: 'center', width: page.width - 2 * left });
    y += 44;

    doc.font(CERTIFICATE_FONTS.regular).fontSize(12).fillColor('#4a4a4a');
    doc.text('Được trao cho', left, y, { align: 'center', width: page.width - 2 * left });
    y += 26;
    doc.font(CERTIFICATE_FONTS.bold).fontSize(24).fillColor('#1f1a12');
    doc.text(data.holderName, left, y, { align: 'center', width: page.width - 2 * left });
    y += 38;

    doc.font(CERTIFICATE_FONTS.regular).fontSize(12).fillColor('#4a4a4a');
    const contextParts = [
      data.roleLabel ? `Vai trò: ${data.roleLabel}` : null,
      data.projectName ? `Đồ án: ${data.projectName}` : null,
      data.sessionName ? `Phiên thực tập: ${data.sessionName}` : null,
    ].filter((p): p is string => p !== null);
    doc.text(
      contextParts.length > 0 ? contextParts.join('  •  ') : 'Đã hoàn thành chương trình thực tập theo chính sách hoàn thành V-Intern.',
      left,
      y,
      { align: 'center', width: page.width - 2 * left },
    );
    y += 40;

    doc.font(CERTIFICATE_FONTS.regular).fontSize(10.5).fillColor('#4a4a4a');
    doc.text(
      `Chính sách cấp: ${data.policyCode} (phiên bản ${data.policyVersion})${data.completedAt ? ` — hoàn thành ${data.completedAt.toISOString().slice(0, 10)}` : ''} — cấp ngày ${data.issuedAt.toISOString().slice(0, 10)}`,
      left,
      y,
      { align: 'center', width: page.width - 2 * left },
    );
    y += 30;

    // ── ASCII block (built-in font → searchable literal stream) ─────────
    doc.font('Helvetica').fontSize(12).fillColor('#1f1a12');
    doc.text(`Certificate No: ${data.certificateNumber}`, left, y);
    y += 18;
    doc.font('Helvetica').fontSize(10).fillColor('#4a4a4a');
    const footerOptions = { width: page.width - 2 * left };
    const verification = `Verification code: ${data.verificationCode}`;
    doc.text(verification, left, y, footerOptions);
    y += doc.heightOfString(verification, footerOptions) + 5;
    const verifyUrl = `Verify at: ${data.verifyBaseUrl}/${data.verificationCode}`;
    doc.text(verifyUrl, left, y, footerOptions);
    y += doc.heightOfString(verifyUrl, footerOptions) + 10;
    doc.font('Helvetica').fontSize(8.5).fillColor('#7a7a7a');
    doc.text(
      'This certificate is VIRTUAL and bears no payroll/payment value. Verify its authenticity at the URL above.',
      left,
      y,
      footerOptions,
    );

    doc.end();
    return done;
  }
}
