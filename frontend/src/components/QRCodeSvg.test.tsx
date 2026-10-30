import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QRCodeSvg } from './QRCodeSvg';

describe('QRCodeSvg Component', () => {
  it('renders QR code SVG with appropriate accessible role and title', () => {
    const testUrl = 'http://localhost:5173/lobby?code=TECH90';
    render(<QRCodeSvg value={testUrl} title="Lobby Join QR" size={240} />);

    const svg = screen.getByRole('img', { name: 'Lobby Join QR' });
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('240');
  });

  it('handles long URLs without truncation or crashing', () => {
    const longUrl = 'https://techtombola.production.example.com/lobby?code=TECH90&roundId=11111111-2222-3333-4444-555555555555&utm_source=event_screen_display';
    render(<QRCodeSvg value={longUrl} title="Full Length URL QR" />);

    const svg = screen.getByRole('img', { name: 'Full Length URL QR' });
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });

  it('renders safe fallback when value is empty', () => {
    render(<QRCodeSvg value="" title="Fallback QR" />);
    const svg = screen.getByRole('img', { name: 'Fallback QR' });
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });
});
