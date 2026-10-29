import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  className?: string;
  title?: string;
}

export function QRCodeSvg({
  value,
  size = 200,
  fgColor = '#1d2421',
  bgColor = '#ffffff',
  className,
  title = 'Game Join QR Code',
}: QRCodeProps) {
  const safeValue = value && value.trim().length > 0 ? value.trim() : 'https://techtombola.internal';

  return (
    <div
      className={className}
      style={{ display: 'inline-block', maxWidth: '100%', background: bgColor, padding: '8px', borderRadius: '4px' }}
    >
      <QRCodeSVG
        value={safeValue}
        size={size}
        fgColor={fgColor}
        bgColor={bgColor}
        level="M"
        title={title}
        style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
      />
    </div>
  );
}
