import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { FuelEntry } from '../fuel/types';
import type { Vehicle } from '../vehicles/types';
import { formatRupees } from '../fuel/formatters';
import { localDate } from './dates';
import { summarize, type SpendingRow } from './spending';

export async function androidOwnershipPdf(
  vehicle: Vehicle, rows: SpendingRow[], fuel: FuelEntry[], from: string, to: string,
) {
  const document = await PDFDocument.create();
  document.setTitle('DriveSentry Ownership Report');
  document.registerFontkit(fontkit);
  const asset = await Asset.fromModule(Inter_700Bold).downloadAsync();
  if (!asset.localUri) throw Error('The report font could not be loaded.');
  const font = await document.embedFont(await new File(asset.localUri).bytes());
  const metrics = summarize(rows, fuel, from, to);
  const tint = rgb(0.03, 0.46, 0.33);
  const ink = rgb(0.08, 0.13, 0.19);
  let page: PDFPage;
  let y = 0;
  function addPage() {
    page = document.addPage([595, 842]);
    y = 790;
  }
  function line(text: string, size = 12, color = ink, leading = 8) {
    // Measure the embedded font so long vehicle or category names wrap in-page.
    let row = '';
    for (const char of text) {
      if (row && font.widthOfTextAtSize(row + char, size) > 499) {
        if (y < 56) addPage();
        page.drawText(row, { x: 48, y, font, size, color });
        y -= size + leading;
        row = '';
      }
      row += /[\u0000-\u001f]/.test(char) ? ' ' : char;
    }
    if (y < 56) addPage();
    page.drawText(row, { x: 48, y, font, size, color });
    y -= size + leading;
  }
  addPage();
  line('DRIVESENTRY', 13, tint, 13);
  line('Ownership report', 27, ink, 18);
  line(vehicle.name, 19, ink);
  line(vehicle.manufacturer + ' ' + vehicle.model);
  line('Reporting period · ' + (from || 'earliest record') + ' through ' + (to || 'latest record'));
  line('Generated ' + localDate());
  y -= 16;
  line('Recorded spending', 15, tint);
  line(formatRupees(metrics.total), 24, ink, 18);
  for (const [kind, amount] of metrics.totals) line(kind + '  ' + formatRupees(amount));
  line(metrics.paid.filter(row => row.kind === 'Fuel').length + ' fuel entries and ' +
    metrics.paid.filter(row => row.kind === 'Service').length + ' completed services.');
  if (metrics.fuelCost !== null) line('Recorded fuel cost ' + formatRupees(Math.round(metrics.fuelCost)) + '/km over full-tank intervals.');
  y -= 12;
  line('Category breakdown', 15, tint);
  for (const [category, amount] of [...metrics.category].sort((a, b) => b[1] - a[1])) {
    line(category + '  ' + formatRupees(amount));
  }
  y -= 12;
  line('Totals reflect saved entries for this vehicle and period.', 10);
  line('Planned service costs are excluded. Missing entries may understate spending.', 10);
  return document.save();
}
