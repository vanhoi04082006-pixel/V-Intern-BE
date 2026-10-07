import { CertificatePdfService } from './certificate-pdf.service';

describe('CertificatePdfService (spec 51-53)', () => {
  const service = new CertificatePdfService();

  const data = {
    certificateNumber: 'VINT-2026-00000042',
    verificationCode: 'vcode-1234567890abcdef1234567890ab',
    holderName: 'Nguyễn Văn Hải',
    roleLabel: 'Backend Developer',
    projectName: 'Hệ thống quản lý thư viện',
    sessionName: 'Spring 2026 Internship',
    policyCode: 'V-INTERN-COMPLETE',
    policyVersion: 1,
    issuedAt: new Date(Date.UTC(2026, 2, 15, 10, 0, 0)),
    verifyBaseUrl: 'http://localhost:8080/api/v1/certificates/verify',
  };

  it('produces a real, non-empty PDF with the certificate number represented', async () => {
    const pdf = await service.render(data);
    const s = pdf.toString('latin1');
    expect(pdf.length).toBeGreaterThan(2000);
    expect(s.startsWith('%PDF-')).toBe(true);
    // pdfkit subsets all fonts (glyph-ID streams) — identity fields are
    // carried in the Info dictionary and are raw-verifiable.
    expect(s.includes(`V-Intern Certificate ${data.certificateNumber}`)).toBe(true);
    expect(s.includes(`verification ${data.verificationCode}`)).toBe(true);
  });

  it('is deterministic — identical inputs produce identical bytes (spec 53)', async () => {
    const a = await service.render(data);
    const b = await service.render(data);
    expect(a.equals(b)).toBe(true);
  });

  it('pins CreationDate to issuedAt (no wall-clock leakage)', async () => {
    const pdf = await service.render(data);
    const s = pdf.toString('latin1');
    expect(s).toContain('D:20260315100000');
  });

  it('renders Vietnamese holder names (DejaVu embedded, no mojibake crash)', async () => {
    const pdf = await service.render({ ...data, holderName: 'Trần Thị Én Ỡ' });
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
