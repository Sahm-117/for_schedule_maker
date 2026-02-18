import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { weeksApi } from '../services/api';
import { exportWeekToPDF } from '../utils/pdfExport';
import type { Week } from '../types';

const parseWeekNumber = (raw: string | null): number | undefined => {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
};

const SopDownload: React.FC = () => {
  const [searchParams] = useSearchParams();
  const requestedWeek = useMemo(() => parseWeekNumber(searchParams.get('week')), [searchParams]);
  const [week, setWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [autoAttempted, setAutoAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWeek = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await weeksApi.getAll();
        const weeks = response.weeks || [];
        if (weeks.length === 0) {
          throw new Error('No schedule weeks found.');
        }

        const targetWeek = typeof requestedWeek === 'number'
          ? (weeks.find((item) => item.weekNumber === requestedWeek) || null)
          : weeks[0];

        if (!targetWeek) {
          throw new Error(`Week ${requestedWeek} was not found.`);
        }

        setWeek(targetWeek);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load schedule.');
      } finally {
        setLoading(false);
      }
    };

    loadWeek();
  }, [requestedWeek]);

  const handleDownload = async () => {
    if (!week) return;

    setDownloading(true);
    setError(null);

    try {
      await exportWeekToPDF(week, { includeEmptyDays: false });
      setDownloaded(true);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Failed to generate SOP PDF.');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (loading || !week || autoAttempted) return;
    setAutoAttempted(true);
    void handleDownload();
  }, [loading, week, autoAttempted]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow border border-gray-100 p-6">
        <div className="flex items-center justify-center mb-4">
          <img
            src="/logo-mark.png"
            alt="The Covenant Nation"
            className="h-10 w-10 rounded bg-white p-1 border border-gray-200 object-contain"
          />
        </div>

        <h1 className="text-xl font-bold text-gray-900 text-center">
          FOF IKD - SOP Manager
        </h1>
        <p className="text-sm text-gray-600 text-center mt-2">
          {week
            ? `Week ${week.weekNumber} SOP download`
            : (typeof requestedWeek === 'number' ? `Loading Week ${requestedWeek}...` : 'Loading schedule...')}
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={loading || downloading || !week}
            className="w-full inline-flex items-center justify-center px-4 py-3 rounded-lg bg-primary text-white font-medium disabled:opacity-50"
          >
            {downloading ? 'Preparing PDF...' : 'Download SOP PDF'}
          </button>

          {downloaded && !downloading && !error && (
            <p className="text-sm text-green-700 text-center">
              Download started. If nothing happened, tap the button again.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 text-center">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-primary hover:text-primary-dark">
            Open App
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SopDownload;
