import jsPDF from 'jspdf';
import type { Week } from '../types';

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

    // Activities grouped and sorted
    const allActivities = day.activities
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .sort((a, b) => a.time.localeCompare(b.time));

    for (const activity of allActivities) {
      // Check page break for activities
      if (yPosition > pageHeight - 20) {
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

      // Description with line wrapping
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...COLORS.brand.lightText);
      const descriptionLines = pdf.splitTextToSize(activity.description, 140);
      pdf.text(descriptionLines, 55, yPosition);

      yPosition += Math.max(7, descriptionLines.length * 5);
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
    pdf.text(`Foundation of Faith | Week ${week.weekNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
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
    pdf.text(`Foundation of Faith Complete Schedule - Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  pdf.save('FOF-Complete-Schedule.pdf');
};