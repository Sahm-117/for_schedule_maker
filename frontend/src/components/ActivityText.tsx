import React from 'react';

export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#25D366"
      d="M20.52 3.48A11.84 11.84 0 0 0 12.08 0C5.5 0 .14 5.34.14 11.93c0 2.1.55 4.16 1.6 5.97L0 24l6.27-1.64a11.92 11.92 0 0 0 5.8 1.49h.01c6.58 0 11.94-5.34 11.94-11.92 0-3.18-1.24-6.16-3.5-8.45Z"
    />
    <path
      fill="#FFF"
      d="M12.09 21.82a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.72.98 1-3.63-.23-.37a9.84 9.84 0 0 1-1.52-5.26c0-5.45 4.43-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.8 9.8 0 0 1 2.9 6.98c0 5.46-4.43 9.9-9.9 9.9Zm5.43-7.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.46-.15-.66.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.64.07-.3-.15-1.26-.47-2.4-1.5a8.95 8.95 0 0 1-1.66-2.06c-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.5.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.91-2.2-.23-.56-.47-.49-.66-.5h-.56c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.49 0 1.46 1.08 2.88 1.23 3.08.15.2 2.12 3.24 5.13 4.54.72.31 1.28.5 1.72.64.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.34Z"
    />
  </svg>
);

export const TelegramIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#229ED9" />
    <path
      fill="#FFF"
      d="M5.49 11.77 17.3 7.2c.55-.2 1.03.13.85.96l-2.01 9.46c-.15.68-.56.85-1.13.53l-3.12-2.3-1.5 1.45c-.17.17-.31.31-.63.31l.22-3.18 5.79-5.23c.25-.22-.06-.35-.39-.13l-7.15 4.5-3.08-.96c-.67-.21-.68-.67.14-.99Z"
    />
  </svg>
);

const TOKEN = /(whatsapp|telegram)/gi;

const ActivityText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const parts = text.split(TOKEN);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const lower = part.toLowerCase();
        if (lower === 'whatsapp' || lower === 'telegram') {
          const Icon = lower === 'whatsapp' ? WhatsAppIcon : TelegramIcon;
          return (
            <span key={`${part}-${index}`} className="inline-flex translate-y-[2px] items-center gap-1">
              <span>{part}</span>
              <Icon className="h-4 w-4" />
            </span>
          );
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      })}
    </span>
  );
};

export default ActivityText;
