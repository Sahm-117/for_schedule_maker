import jsPDF from 'jspdf';
import type { Week } from '../types';
import { compareTimeStrings } from './time';
import { getContrastingTextColor, hexToRgb, normalizeHexColor } from './color';

interface ExportOptions {
  includeEmptyDays?: boolean;
  format?: 'portrait' | 'landscape';
}

// Clean design colors - FOF brand focused
const COLORS = {
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

const addTimelineHeader = (pdf: jsPDF, pageWidth: number, weekNumber: number): number => {
  let yPosition = 20;

  // Main title - Foundation of Faith
  pdf.setFontSize(24);
  pdf.setTextColor(...COLORS.brand.orange);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Foundation of Faith - Week ' + weekNumber, pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 10;

  // Subtitle
  pdf.setFontSize(18);
  pdf.setTextColor(...COLORS.brand.text);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Sunday Schedule', pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 10;

  // Orange line under header
  pdf.setDrawColor(...COLORS.brand.orange);
  pdf.setLineWidth(2);
  pdf.line(20, yPosition, pageWidth - 20, yPosition);

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
    const rgb = hexToRgb(bg) || [229, 231, 235];
    const fg = getContrastingTextColor(bg);
    const textRgb = fg === '#FFFFFF' ? [255, 255, 255] : [0, 0, 0];

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
    pdf.setTextColor(...(textRgb as any));
    pdf.text(label.name, x + chipPadX, y);

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

export const exportWeekToPDF = async (week: Week, options: ExportOptions = {}) => {
  const { includeEmptyDays = false, format = 'portrait' } = options;

  // Create clean timeline PDF
  const pdf = new jsPDF({
    orientation: format,
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Clean header
  let yPosition = addTimelineHeader(pdf, pageWidth, week.weekNumber);

  // Day order for proper week flow
  const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const sortedDays = [...week.days].sort((a, b) =>
    dayOrder.indexOf(a.dayName) - dayOrder.indexOf(b.dayName)
  );

  // Process each day
  for (const day of sortedDays) {
    const hasActivities = day.activities && day.activities.length > 0;

    // Skip empty days if option is set
    if (!includeEmptyDays && !hasActivities) {
      continue;
    }

    // Check if we need a new page
    if (yPosition > pageHeight - 60) {
      pdf.addPage();
      yPosition = addTimelineHeader(pdf, pageWidth, week.weekNumber);
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
    const allActivities = [...day.activities].sort((a, b) => {
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
      const descriptionLines = pdf.splitTextToSize(activity.description, descMaxWidth);
      const lineHeight = 5;

      // Estimate label chip height for page breaks
      const labels = Array.isArray((activity as any).labels) ? ((activity as any).labels as any[]) : [];
      const chipBlockEstimate = estimateLabelChipBlockHeight(
        pdf,
        labels.map((l: any) => ({ name: String(l?.name || '') })),
        descMaxWidth
      );
      const needed = Math.max(7, descriptionLines.length * lineHeight) + chipBlockEstimate;

      // Check page break for activities
      if (yPosition + needed > pageHeight - 20) {
        pdf.addPage();
        yPosition = addTimelineHeader(pdf, pageWidth, week.weekNumber);
      }

      // Determine border color based on period
      let borderColor: number[];
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
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...COLORS.brand.lightText);
      for (let i = 0; i < descriptionLines.length; i++) {
        pdf.text(descriptionLines[i], descX, yPosition + i * lineHeight);
      }

      let nextY = yPosition + Math.max(7, descriptionLines.length * lineHeight);

      // Labels (chips) below description
      if (Array.isArray((activity as any).labels) && (activity as any).labels.length > 0) {
        const chipsStartY = yPosition + descriptionLines.length * lineHeight + 1;
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

  // Download the PDF
  const fileName = `FOF-Week-${week.weekNumber}-Schedule.pdf`;
  pdf.save(fileName);
};

export const exportAllWeeksToPDF = async (weeks: Week[], options: ExportOptions = {}) => {
  const { format = 'portrait' } = options;

  const pdf = new jsPDF({
    orientation: format,
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Header for complete schedule
  let yPosition = 20;

  // Main title
  pdf.setFontSize(24);
  pdf.setTextColor(...COLORS.brand.orange);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Foundation of Faith', pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 10;

  // Subtitle
  pdf.setFontSize(18);
  pdf.setTextColor(...COLORS.brand.text);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Complete Programme Schedule', pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 10;

  // Orange line
  pdf.setDrawColor(...COLORS.brand.orange);
  pdf.setLineWidth(2);
  pdf.line(20, yPosition, pageWidth - 20, yPosition);

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
