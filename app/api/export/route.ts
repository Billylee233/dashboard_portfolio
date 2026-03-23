import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

interface SheetData {
  sheetName: string;
  headers: string[];
  rows: (string | number)[][];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, sheets: multiSheets, headers, rows } = body;

    const sheetDataList: SheetData[] = multiSheets
      ? multiSheets
      : [{ sheetName: title ?? 'Export', headers, rows }];

    // 워크북 생성
    const wb = XLSX.utils.book_new();

    for (const { sheetName, headers: h, rows: r } of sheetDataList) {
      const wsData = [h, ...r];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // 헤더 행 스타일 (굵게)
      const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: col })];
        if (cell) {
          cell.s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '2E4F78' } },
          };
        }
      }

      // 컬럼 너비 자동 조정
      const colWidths = h.map((_, ci) => {
        const maxLen = Math.max(
          h[ci]?.toString().length ?? 10,
          ...r.map(row => row[ci]?.toString().length ?? 0)
        );
        return { wch: Math.min(maxLen + 2, 50) };
      });
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    // Buffer로 변환
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `${(title ?? 'export').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err: any) {
    console.error('[API /export]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
