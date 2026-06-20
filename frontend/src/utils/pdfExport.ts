import type jsPDF from 'jspdf';
import type { Week } from '../types';
import { compareTimeStrings } from './time';
import { getContrastingTextColor, hexToRgb, normalizeHexColor } from './color';
import {
  parseActivityDescription,
  type ActivityInlineToken,
} from './activityDescription';

// jsPDF is heavy (~hundreds of KB). Load it on demand so it stays out of the
// initial bundle — only users who actually export a PDF pay the cost.
const loadJsPdf = async (): Promise<typeof jsPDF> => {
  const mod = await import('jspdf');
  return mod.default;
};

interface ExportOptions {
  includeEmptyDays?: boolean;
  format?: 'portrait' | 'landscape';
  filterLabelIds?: string[];
  subtitle?: string;
  fileName?: string;
}

const loadPublicPngAsDataUrl = async (path: string): Promise<string | null> => {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

type Rgb = [number, number, number];

// Clean design colors - FOF brand focused
const COLORS: {
  brand: Record<'orange' | 'text' | 'lightText' | 'line', Rgb>;
  periods: Record<'morning' | 'afternoon' | 'evening', Rgb>;
} = {
  brand: {
    orange: [255, 145, 77],    // FOF Orange
    text: [51, 51, 51],        // Dark gray text
    lightText: [85, 85, 85],   // Medium gray text
    line: [230, 230, 230],     // Light gray lines
  },
  periods: {
    morning: [255, 179, 102],    // Orange
    afternoon: [102, 204, 153], // Green
    evening: [153, 153, 153],   // Gray
  },
};

// Simple helper functions for clean timeline design
const formatTime = (time: string): string => {
  try {
    const [hours, minutes] = time.split(':');
    const hour24 = parseInt(hours);
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  } catch {
    return time;
  }
};

type TimelineHeaderOptions = {
  showLogo?: boolean;
  logoDataUrl?: string | null;
  subtitle?: string;
};

const addTimelineHeader = (pdf: jsPDF, pageWidth: number, weekNumber: number, opts: TimelineHeaderOptions = {}): number => {
  const { showLogo = false, logoDataUrl = null, subtitle = 'Week Schedule' } = opts;

  const leftMargin = 20;
  const rightMargin = 20;
  const textX = pageWidth - rightMargin;

  // Full logo (wide) goes top-left only on the first page.
  const logoX = leftMargin;
  const logoY = 12;
  const logoW = 38;
  const logoH = logoW * (66 / 230);

  if (showLogo && logoDataUrl) {
    // White background behind logo to guarantee readability.
    pdf.setFillColor(255, 255, 255);
    pdf.rect(logoX, logoY, logoW, logoH, 'F');

    const addImage = (pdf as any).addImage;
    if (typeof addImage === 'function') {
      addImage.call(pdf, logoDataUrl, 'PNG', logoX, logoY, logoW, logoH);
    }
  }

  let yPosition = 20;

  // Main title - Foundation of Faith
  pdf.setFontSize(24);
  pdf.setTextColor(...COLORS.brand.orange);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Foundation of Faith - Week ' + weekNumber, textX, yPosition, { align: 'right' });

  yPosition += 10;

  // Subtitle
  pdf.setFontSize(18);
  pdf.setTextColor(...COLORS.brand.text);
  pdf.setFont('helvetica', 'normal');
  pdf.text(subtitle, textX, yPosition, { align: 'right' });

  yPosition += 10;

  // Orange line under header
  pdf.setDrawColor(...COLORS.brand.orange);
  pdf.setLineWidth(2);
  const lineStartX = showLogo && logoDataUrl ? (logoX + logoW + 6) : leftMargin;
  pdf.line(lineStartX, yPosition, pageWidth - rightMargin, yPosition);

  return yPosition + 15;
};

const drawLabelChips = (pdf: jsPDF, labels: Array<{ name: string; color: string }>, xStart: number, yStart: number, maxWidth: number): number => {
  if (!labels || labels.length === 0) return yStart;

  // Chips styling
  const chipHeight = 5;
  const chipPadX = 2;
  const gapX = 2;
  const gapY = 2;

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');

  let x = xStart;
  let y = yStart;

  for (const label of labels) {
    const bg = normalizeHexColor(label.color) || '#E5E7EB';
    const rgb: Rgb = hexToRgb(bg) || [229, 231, 235];
    const fg = getContrastingTextColor(bg);
    const textRgb: Rgb = fg === '#FFFFFF' ? [255, 255, 255] : [0, 0, 0];

    const textW = pdf.getTextWidth(label.name);
    const chipW = Math.min(maxWidth, textW + chipPadX * 2 + 2);

    if (x + chipW > xStart + maxWidth) {
      x = xStart;
      y += chipHeight + gapY;
    }

    // Rounded rect background
    pdf.setDrawColor(...rgb);
    pdf.setFillColor(...rgb);
    const rr = (pdf as any).roundedRect;
    if (typeof rr === 'function') {
      rr.call(pdf, x, y - chipHeight + 1, chipW, chipHeight, 2, 2, 'F');
    } else {
      pdf.rect(x, y - chipHeight + 1, chipW, chipHeight, 'F');
    }

    // Text
    pdf.setTextColor(...textRgb);
    // jsPDF positions text by baseline; nudge up for visual centering within the pill.
    pdf.text(label.name, x + chipPadX, y - 1);

    x += chipW + gapX;
  }

  // Restore default font styling
  pdf.setTextColor(...COLORS.brand.lightText);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);

  return y + chipHeight + 1;
};

const estimateLabelChipBlockHeight = (pdf: jsPDF, labels: Array<{ name: string }>, maxWidth: number): number => {
  if (!labels || labels.length === 0) return 0;

  const chipHeight = 5;
  const chipPadX = 2;
  const gapX = 2;
  const gapY = 2;

  const prevFontSize = (pdf as any).getFontSize?.() ?? 11;
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');

  let lineCount = 1;
  let x = 0;

  for (const label of labels) {
    const textW = pdf.getTextWidth(label.name);
    const chipW = Math.min(maxWidth, textW + chipPadX * 2 + 2);
    if (x > 0 && x + chipW > maxWidth) {
      lineCount += 1;
      x = 0;
    }
    x += chipW + gapX;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(prevFontSize);

  // Baseline y from description to chips uses yStart = descEnd + 1, then chips add lines with chipHeight + gapY.
  return lineCount * (chipHeight + gapY) + 1;
};

type PdfDescriptionFragment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

type PdfDescriptionLine = {
  fragments: PdfDescriptionFragment[];
  marker?: string;
  contentOffset?: number;
  height: number;
};

const DESCRIPTION_LINE_HEIGHT = 5;
const DESCRIPTION_BLANK_LINE_HEIGHT = 3;
const DESCRIPTION_LIST_OFFSET = 7;

const setDescriptionFont = (pdf: jsPDF, fragment?: PdfDescriptionFragment) => {
  const style = fragment?.bold && fragment?.italic
    ? 'bolditalic'
    : fragment?.bold
      ? 'bold'
      : fragment?.italic
        ? 'italic'
        : 'normal';
  pdf.setFont('helvetica', style);
};

const measureDescriptionText = (pdf: jsPDF, fragment: PdfDescriptionFragment): number => {
  setDescriptionFont(pdf, fragment);
  return pdf.getTextWidth(fragment.text);
};

const pushDescriptionFragment = (line: PdfDescriptionFragment[], fragment: PdfDescriptionFragment) => {
  if (!fragment.text) return;
  const previous = line[line.length - 1];
  if (previous && previous.bold === fragment.bold && previous.italic === fragment.italic) {
    previous.text += fragment.text;
  } else {
    line.push({ ...fragment });
  }
};

const splitInlineTokenForPdf = (token: ActivityInlineToken): PdfDescriptionFragment[] => {
  const parts = token.text.match(/\S+\s*|\s+/g) || [token.text];
  return parts.map((text) => ({
    text,
    bold: token.bold,
    italic: token.italic,
  }));
};

const wrapDescriptionFragments = (
  pdf: jsPDF,
  tokens: ActivityInlineToken[],
  maxWidth: number,
  contentOffset = 0,
  marker?: string
): PdfDescriptionLine[] => {
  const fragments = tokens.flatMap(splitInlineTokenForPdf);
  const lines: PdfDescriptionLine[] = [];
  let currentLine: PdfDescriptionFragment[] = [];
  let currentWidth = 0;
  let firstLine = true;

  const flushLine = () => {
    lines.push({
      fragments: currentLine,
      marker: firstLine ? marker : undefined,
      contentOffset,
      height: DESCRIPTION_LINE_HEIGHT,
    });
    currentLine = [];
    currentWidth = 0;
    firstLine = false;
  };

  fragments.forEach((fragment) => {
    let nextFragment = { ...fragment };
    let width = measureDescriptionText(pdf, nextFragment);
    if (currentLine.length > 0 && currentWidth + width > maxWidth) {
      flushLine();
      nextFragment = { ...nextFragment, text: nextFragment.text.trimStart() };
      width = measureDescriptionText(pdf, nextFragment);
    }
    pushDescriptionFragment(currentLine, nextFragment);
    currentWidth += width;
  });

  if (currentLine.length > 0) flushLine();
  if (lines.length === 0) {
    lines.push({
      fragments: [],
      marker,
      contentOffset,
      height: DESCRIPTION_BLANK_LINE_HEIGHT,
    });
  }

  return lines;
};

const layoutActivityDescription = (pdf: jsPDF, description: string, maxWidth: number): PdfDescriptionLine[] => {
  const blocks = parseActivityDescription(description);
  const lines: PdfDescriptionLine[] = [];

  blocks.forEach((block) => {
    if (block.type === 'paragraph') {
      if (block.inlines.length === 0) {
        lines.push({ fragments: [], height: DESCRIPTION_BLANK_LINE_HEIGHT });
      } else {
        lines.push(...wrapDescriptionFragments(pdf, block.inlines, maxWidth));
      }
      return;
    }

    block.items.forEach((item, index) => {
      const marker = block.ordered ? `${index + 1}.` : '•';
      lines.push(...wrapDescriptionFragments(
        pdf,
        item.inlines,
        Math.max(20, maxWidth - DESCRIPTION_LIST_OFFSET),
        DESCRIPTION_LIST_OFFSET,
        marker
      ));
    });
  });

  return lines.length > 0 ? lines : [{ fragments: [], height: DESCRIPTION_BLANK_LINE_HEIGHT }];
};

const getDescriptionHeight = (lines: PdfDescriptionLine[]): number =>
  lines.reduce((sum, line) => sum + line.height, 0);

const drawFormattedDescription = (
  pdf: jsPDF,
  lines: PdfDescriptionLine[],
  x: number,
  y: number
): number => {
  let currentY = y;
  pdf.setFontSize(11);
  pdf.setTextColor(...COLORS.brand.lightText);

  lines.forEach((line) => {
    if (line.marker) {
      pdf.setFont('helvetica', 'normal');
      pdf.text(line.marker, x, currentY);
    }

    let currentX = x + (line.contentOffset || 0);
    line.fragments.forEach((fragment) => {
      if (!fragment.text) return;
      setDescriptionFont(pdf, fragment);
      pdf.text(fragment.text, currentX, currentY);
      currentX += pdf.getTextWidth(fragment.text);
    });
    currentY += line.height;
  });

  pdf.setFont('helvetica', 'normal');
  return currentY;
};

const exportScheduleToPDF = async (week: Week, options: ExportOptions = {}) => {
  const { includeEmptyDays = false, format = 'portrait', filterLabelIds, subtitle, fileName } = options;
  const isPersonal = Array.isArray(filterLabelIds) && filterLabelIds.length > 0;

  // Create clean timeline PDF
  const JsPdf = await loadJsPdf();
  const pdf = new JsPdf({
    orientation: format,
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const logoDataUrl = await loadPublicPngAsDataUrl('/logo-full.png');
  let pageIndex = 1;

  const scheduleSubtitle = subtitle ?? (isPersonal ? 'My Schedule' : 'Week Schedule');
  let yPosition = addTimelineHeader(pdf, pageWidth, week.weekNumber, {
    showLogo: pageIndex === 1,
    logoDataUrl,
    subtitle: scheduleSubtitle,
  });

  // Day order for proper week flow
  const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const sortedDays = [...week.days].sort((a, b) =>
    dayOrder.indexOf(a.dayName) - dayOrder.indexOf(b.dayName)
  );

  // Process each day
  for (const day of sortedDays) {
    const dayActivities = isPersonal
      ? (day.activities || []).filter((a) =>
          a.labels?.some((l) => filterLabelIds!.includes(l.id))
        )
      : day.activities || [];
    const hasActivities = dayActivities.length > 0;

    // Skip empty days if option is set
    if (!includeEmptyDays && !hasActivities) {
      continue;
    }

    // Check if we need a new page
      if (yPosition > pageHeight - 60) {
        pdf.addPage();
        pageIndex += 1;
        yPosition = addTimelineHeader(pdf, pageWidth, week.weekNumber, {
          showLogo: pageIndex === 1,
          logoDataUrl,
          subtitle: scheduleSubtitle,
        });
      }

    // Day title
    pdf.setFontSize(16);
    pdf.setTextColor(...COLORS.brand.text);
    pdf.setFont('helvetica', 'bold');
    pdf.text(day.dayName + ' Schedule', 20, yPosition);
    yPosition += 10;

    if (!hasActivities) {
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(...COLORS.brand.lightText);
      pdf.text('No activities scheduled', 25, yPosition);
      yPosition += 15;
      continue;
    }

    // Activities grouped and sorted (time asc, then manual orderIndex, then id)
    const allActivities = [...dayActivities].sort((a, b) => {
      const t = compareTimeStrings(a.time, b.time);
      if (t !== 0) return t;
      const oi = a.orderIndex - b.orderIndex;
      if (oi !== 0) return oi;
      return a.id - b.id;
    });

    for (const activity of allActivities) {
      const descX = 55;
      const rightMargin = 20;
      const descMaxWidth = Math.max(60, pageWidth - rightMargin - descX);

      // Description with line wrapping (use dynamic width to avoid cutoff)
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      const descriptionLines = layoutActivityDescription(pdf, activity.description, descMaxWidth);
      const descriptionHeight = getDescriptionHeight(descriptionLines);

      // Estimate label chip height for page breaks
      const labels = Array.isArray((activity as any).labels) ? ((activity as any).labels as any[]) : [];
      const chipBlockEstimate = estimateLabelChipBlockHeight(
        pdf,
        labels.map((l: any) => ({ name: String(l?.name || '') })),
        descMaxWidth
      );
      const needed = Math.max(7, descriptionHeight) + chipBlockEstimate;

      // Check page break for activities
      if (yPosition + needed > pageHeight - 20) {
        pdf.addPage();
        pageIndex += 1;
        yPosition = addTimelineHeader(pdf, pageWidth, week.weekNumber, {
          showLogo: pageIndex === 1,
          logoDataUrl,
          subtitle: scheduleSubtitle,
        });
      }

      // Determine border color based on period
      let borderColor: Rgb;
      switch (activity.period) {
        case 'MORNING':
          borderColor = COLORS.periods.morning;
          break;
        case 'AFTERNOON':
          borderColor = COLORS.periods.afternoon;
          break;
        case 'EVENING':
          borderColor = COLORS.periods.evening;
          break;
        default:
          borderColor = COLORS.periods.morning;
      }

      // Draw colored left border
      pdf.setDrawColor(...borderColor);
      pdf.setLineWidth(2);
      pdf.line(20, yPosition - 3, 20, yPosition + 4);

      // Time
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.brand.text);
      const timeText = formatTime(activity.time);
      pdf.text(timeText, 25, yPosition);

      // Description (manual line layout for predictable wrapping)
      const descriptionEndY = drawFormattedDescription(pdf, descriptionLines, descX, yPosition);
      let nextY = yPosition + Math.max(7, descriptionHeight);

      // Labels (chips) below description
      if (Array.isArray((activity as any).labels) && (activity as any).labels.length > 0) {
        const chipsStartY = descriptionEndY + 1;
        nextY = drawLabelChips(
          pdf,
          (activity as any).labels.map((l: any) => ({ name: l.name, color: l.color })),
          descX,
          chipsStartY,
          descMaxWidth
        );
      }

      yPosition = nextY;
    }

    yPosition += 8; // Space between days
  }

  // Simple footer on all pages
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);

    // Footer line
    pdf.setDrawColor(...COLORS.brand.line);
    pdf.setLineWidth(0.5);
    pdf.line(20, pageHeight - 20, pageWidth - 20, pageHeight - 20);

    // Footer text
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.brand.lightText);
    pdf.setFont('helvetica', 'normal');
    pdf.text('TCN Ikorodu | Foundation of Faith SOP', pageWidth / 2, pageHeight - 10, { align: 'center' });
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth - 20, pageHeight - 10, { align: 'right' });
  }

  const resolvedFileName = fileName || (isPersonal
    ? `My-Schedule-Week-${week.weekNumber}.pdf`
    : `FOF-Week-${week.weekNumber}-Schedule.pdf`);
  pdf.save(resolvedFileName);
};

export const exportWeekToPDF = async (week: Week, options: ExportOptions = {}) => {
  await exportScheduleToPDF(week, options);
};

export const exportDayToPDF = async (week: Week, day: Week['days'][number], options: ExportOptions = {}) => {
  const exportWeek: Week = {
    ...week,
    days: [day],
  };
  await exportScheduleToPDF(exportWeek, {
    ...options,
    subtitle: `${day.dayName} Schedule`,
    fileName: options.fileName || `FOF-Week-${week.weekNumber}-${day.dayName}-Schedule.pdf`,
  });
};

export const exportAllWeeksToPDF = async (weeks: Week[], options: ExportOptions = {}) => {
  const { format = 'portrait' } = options;

  const JsPdf = await loadJsPdf();
  const pdf = new JsPdf({
    orientation: format,
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const logoDataUrl = await loadPublicPngAsDataUrl('/logo-full.png');

  // Header for complete schedule
  let yPosition = 20;

  // Full logo on top-left of the first page only
  if (logoDataUrl) {
    const logoX = 20;
    const logoY = 12;
    const logoW = 38;
    const logoH = logoW * (66 / 230);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(logoX, logoY, logoW, logoH, 'F');
    const addImage = (pdf as any).addImage;
    if (typeof addImage === 'function') {
      addImage.call(pdf, logoDataUrl, 'PNG', logoX, logoY, logoW, logoH);
    }
  }

  const rightMargin = 20;
  const textX = pageWidth - rightMargin;

  // Main title
  pdf.setFontSize(24);
  pdf.setTextColor(...COLORS.brand.orange);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Foundation of Faith', textX, yPosition, { align: 'right' });

  yPosition += 10;

  // Subtitle
  pdf.setFontSize(18);
  pdf.setTextColor(...COLORS.brand.text);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Complete Programme Schedule', textX, yPosition, { align: 'right' });

  yPosition += 10;

  // Orange line
  pdf.setDrawColor(...COLORS.brand.orange);
  pdf.setLineWidth(2);
  const lineStartX = logoDataUrl ? (20 + 38 + 6) : 20;
  pdf.line(lineStartX, yPosition, pageWidth - rightMargin, yPosition);

  yPosition += 20;

  // Summary stats
  const totalWeeks = weeks.length;
  const totalActivities = weeks.reduce((sum, week) =>
    sum + week.days.reduce((daySum, day) => daySum + day.activities.length, 0), 0
  );

  pdf.setFontSize(12);
  pdf.setTextColor(...COLORS.brand.text);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Total Weeks: ${totalWeeks}`, 20, yPosition);
  yPosition += 6;
  pdf.text(`Total Activities: ${totalActivities}`, 20, yPosition);
  yPosition += 6;
  pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 20, yPosition);

  yPosition += 20;

  // Week overview
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Week Overview:', 20, yPosition);
  yPosition += 15;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');

  for (const week of weeks) {
    if (yPosition > pageHeight - 30) {
      pdf.addPage();
      yPosition = 20;
    }

    const weekActivities = week.days.reduce((sum, day) => sum + day.activities.length, 0);
    pdf.setTextColor(...COLORS.brand.text);
    pdf.text(`Week ${week.weekNumber}: ${weekActivities} activities`, 20, yPosition);
    yPosition += 6;

    // Show days with activities
    const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sortedDays = [...week.days].sort((a, b) =>
      dayOrder.indexOf(a.dayName) - dayOrder.indexOf(b.dayName)
    );

    for (const day of sortedDays) {
      if (day.activities.length > 0) {
        pdf.setTextColor(...COLORS.brand.lightText);
        pdf.text(`  ${day.dayName}: ${day.activities.length} activities`, 30, yPosition);
        yPosition += 5;
      }
    }
    yPosition += 8;
  }

  // Simple footer
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.brand.lightText);
    pdf.text('TCN Ikorodu | Foundation of Faith SOP', pageWidth / 2, pageHeight - 10, { align: 'center' });
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth - 20, pageHeight - 10, { align: 'right' });
  }

  pdf.save('FOF-Complete-Schedule.pdf');
};
